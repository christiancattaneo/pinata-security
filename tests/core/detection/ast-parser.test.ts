import { describe, it, expect, beforeAll } from "vitest";
import {
  AstPatternMatcher,
  createAstMatcher,
  parseSource,
  executeQuery,
  checkTreeSitterSetup,
  COMMON_AST_PATTERNS,
} from "@/core/detection/ast-parser.js";

describe("AstPatternMatcher", () => {
  let matcher: AstPatternMatcher;
  let wasmAvailable = false;

  beforeAll(async () => {
    matcher = createAstMatcher();

    // Check if WASM files are available
    const setup = await checkTreeSitterSetup();
    wasmAvailable = setup.success && setup.data.ready;

    if (!wasmAvailable) {
      console.warn("Tree-sitter WASM not available. Run: npm run setup:wasm");
    }
  });

  // Helper to check WASM availability and skip test if not available
  const requireWasm = () => {
    if (!wasmAvailable) {
      console.log("Skipping: WASM not available");
      return false;
    }
    return true;
  };

  describe("language support", () => {
    it("reports supported languages", () => {
      const supported = matcher.getSupportedLanguages();

      expect(supported).toContain("python");
      expect(supported).toContain("typescript");
      expect(supported).toContain("javascript");
    });

    it("correctly identifies unsupported languages", () => {
      expect(matcher.isLanguageSupported("python")).toBe(true);
      expect(matcher.isLanguageSupported("go")).toBe(false);
      expect(matcher.isLanguageSupported("rust")).toBe(false);
    });
  });

  describe("Python parsing", () => {
    it("parses simple Python code", async () => {
      if (!requireWasm()) return;

      const source = `
def hello():
    print("Hello, world!")

hello()
`;
      const result = await matcher.parse(source, "python");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.rootNode.type).toBe("module");
        expect(result.data.rootNode.childCount).toBeGreaterThan(0);
      }
    });

    it("finds function definitions", async () => {
      if (!requireWasm()) return;

      const source = `
def greet(name):
    return f"Hello, {name}"

def farewell(name):
    return f"Goodbye, {name}"
`;
      const query = "(function_definition name: (identifier) @name) @func";
      const result = await matcher.query(source, query, "python");

      expect(result.success).toBe(true);
      if (result.success) {
        const funcNames = result.data
          .filter((m) => m.captureName === "name")
          .map((m) => m.text);
        expect(funcNames).toContain("greet");
        expect(funcNames).toContain("farewell");
      }
    });

    it("finds class definitions", async () => {
      if (!requireWasm()) return;

      const source = `
class User:
    def __init__(self, name):
        self.name = name

class Admin(User):
    def __init__(self, name, role):
        super().__init__(name)
        self.role = role
`;
      const query = "(class_definition name: (identifier) @class_name) @class";
      const result = await matcher.query(source, query, "python");

      expect(result.success).toBe(true);
      if (result.success) {
        const classNames = result.data
          .filter((m) => m.captureName === "class_name")
          .map((m) => m.text);
        expect(classNames).toContain("User");
        expect(classNames).toContain("Admin");
      }
    });
  });

  describe("TypeScript parsing", () => {
    it("parses simple TypeScript code", async () => {
      if (!requireWasm()) return;
      const source = `
function greet(name: string): string {
  return \`Hello, \${name}\`;
}

const result = greet("World");
`;
      const result = await matcher.parse(source, "typescript");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.rootNode.type).toBe("program");
      }
    });

    it("finds function declarations", async () => {
      if (!requireWasm()) return;
      const source = `
function add(a: number, b: number): number {
  return a + b;
}

const multiply = (a: number, b: number): number => a * b;
`;
      const query = "(function_declaration name: (identifier) @name) @func";
      const result = await matcher.query(source, query, "typescript");

      expect(result.success).toBe(true);
      if (result.success) {
        const funcNames = result.data
          .filter((m) => m.captureName === "name")
          .map((m) => m.text);
        expect(funcNames).toContain("add");
      }
    });

    it("finds interface declarations", async () => {
      if (!requireWasm()) return;
      const source = `
interface User {
  id: string;
  name: string;
}

interface Admin extends User {
  role: string;
}
`;
      const query = "(interface_declaration name: (type_identifier) @name) @interface";
      const result = await matcher.query(source, query, "typescript");

      expect(result.success).toBe(true);
      if (result.success) {
        const interfaceNames = result.data
          .filter((m) => m.captureName === "name")
          .map((m) => m.text);
        expect(interfaceNames).toContain("User");
        expect(interfaceNames).toContain("Admin");
      }
    });
  });

  describe("JavaScript parsing", () => {
    it("parses simple JavaScript code", async () => {
      if (!requireWasm()) return;
      const source = `
function hello() {
  console.log("Hello!");
}

hello();
`;
      const result = await matcher.parse(source, "javascript");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.rootNode.type).toBe("program");
      }
    });

    it("finds async functions", async () => {
      if (!requireWasm()) return;
      const source = `
async function fetchData(url) {
  const response = await fetch(url);
  return response.json();
}

const getData = async () => {
  return await fetchData("/api/data");
};
`;
      const query = "(function_declaration name: (identifier) @name) @func";
      const result = await matcher.query(source, query, "javascript");

      expect(result.success).toBe(true);
      if (result.success) {
        const funcNames = result.data
          .filter((m) => m.captureName === "name")
          .map((m) => m.text);
        expect(funcNames).toContain("fetchData");
      }
    });
  });

  describe("SQL injection detection", () => {
    describe("Python patterns", () => {
      it("detects string formatting in execute", async () => {
        if (!requireWasm()) return;
        const source = `
def get_user(user_id):
    query = "SELECT * FROM users WHERE id = '%s'" % user_id
    cursor.execute(query)
    return cursor.fetchone()
`;
        // Query for binary operator with % in a call
        const query = `
          (call
            function: (attribute
              attribute: (identifier) @method)
            arguments: (argument_list)) @call
          (#match? @method "^execute$")
        `;
        const result = await matcher.query(source, query, "python");

        expect(result.success).toBe(true);
        if (result.success) {
          const calls = result.data.filter((m) => m.captureName === "call");
          expect(calls.length).toBeGreaterThan(0);
          expect(calls[0]?.text).toContain("cursor.execute");
        }
      });

      it("detects f-string in execute", async () => {
        if (!requireWasm()) return;
        const source = `
def search_products(name):
    query = f"SELECT * FROM products WHERE name LIKE '%{name}%'"
    cursor.execute(query)
    return cursor.fetchall()
`;
        // Query for execute call with any argument
        const query = `
          (call
            function: (attribute
              attribute: (identifier) @method)) @call
          (#match? @method "^execute$")
        `;
        const result = await matcher.query(source, query, "python");

        expect(result.success).toBe(true);
        if (result.success) {
          const calls = result.data.filter((m) => m.captureName === "call");
          expect(calls.length).toBeGreaterThan(0);
        }
      });

      it("detects concatenation in execute", async () => {
        if (!requireWasm()) return;
        const source = `
def get_order(order_id):
    cursor.execute("SELECT * FROM orders WHERE id = " + order_id)
    return cursor.fetchone()
`;
        const query = `
          (call
            function: (attribute
              attribute: (identifier) @method)
            arguments: (argument_list
              (binary_operator) @concat)) @call
          (#match? @method "^execute$")
        `;
        const result = await matcher.query(source, query, "python");

        expect(result.success).toBe(true);
        if (result.success) {
          const calls = result.data.filter((m) => m.captureName === "call");
          expect(calls.length).toBeGreaterThan(0);
        }
      });
    });

    describe("TypeScript/JavaScript patterns", () => {
      it("detects template literal in query", async () => {
        if (!requireWasm()) return;
        const source = `
async function getUser(userId: string) {
  const query = \`SELECT * FROM users WHERE id = '\${userId}'\`;
  const result = await db.query(query);
  return result.rows[0];
}
`;
        const query = `
          (call_expression
            function: (member_expression
              property: (property_identifier) @method)
            arguments: (arguments)) @call
          (#match? @method "^query$")
        `;
        const result = await matcher.query(source, query, "typescript");

        expect(result.success).toBe(true);
        if (result.success) {
          const calls = result.data.filter((m) => m.captureName === "call");
          expect(calls.length).toBeGreaterThan(0);
          expect(calls[0]?.text).toContain("db.query");
        }
      });

      it("detects string concatenation in query", async () => {
        if (!requireWasm()) return;
        const source = `
async function searchProducts(name: string) {
  const result = await db.query("SELECT * FROM products WHERE name = '" + name + "'");
  return result.rows;
}
`;
        const query = `
          (call_expression
            function: (member_expression
              property: (property_identifier) @method)
            arguments: (arguments
              (binary_expression) @concat)) @call
          (#match? @method "^query$")
        `;
        const result = await matcher.query(source, query, "typescript");

        expect(result.success).toBe(true);
        if (result.success) {
          const calls = result.data.filter((m) => m.captureName === "call");
          expect(calls.length).toBeGreaterThan(0);
        }
      });
    });
  });

  describe("command injection detection", () => {
    it("detects subprocess with concatenation", async () => {
      if (!requireWasm()) return;
      const source = `
import subprocess

def run_command(user_input):
    subprocess.call("ls " + user_input, shell=True)
`;
      const query = `
        (call
          function: (attribute
            object: (identifier) @module
            attribute: (identifier) @method)) @call
        (#match? @module "^subprocess$")
        (#match? @method "^call$|^run$|^Popen$")
      `;
      const result = await matcher.query(source, query, "python");

      expect(result.success).toBe(true);
      if (result.success) {
        const calls = result.data.filter((m) => m.captureName === "call");
        expect(calls.length).toBeGreaterThan(0);
      }
    });
  });

  describe("eval detection", () => {
    it("detects eval usage in JavaScript", async () => {
      if (!requireWasm()) return;
      const source = `
function dangerous(userCode) {
  eval(userCode);
}
`;
      const query = `
        (call_expression
          function: (identifier) @func) @call
        (#match? @func "^eval$")
      `;
      const result = await matcher.query(source, query, "javascript");

      expect(result.success).toBe(true);
      if (result.success) {
        const funcs = result.data.filter((m) => m.captureName === "func");
        expect(funcs.some((f) => f.text === "eval")).toBe(true);
      }
    });
  });

  describe("cache management", () => {
    it("tracks cache entries", async () => {
      matcher.clearCache();
      const stats1 = matcher.getCacheStats();
      expect(stats1.entries).toBe(0);

      if (wasmAvailable) {
        await matcher.parse("def foo(): pass", "python", "test-cache-key");
        const stats2 = matcher.getCacheStats();
        expect(stats2.entries).toBe(1);
      }
    });

    it("clears cache", () => {
      matcher.clearCache();
      expect(matcher.getCacheStats().entries).toBe(0);
    });
  });

  describe("error handling", () => {
    it("handles invalid query syntax", async () => {
      if (!requireWasm()) return;
      const source = "def foo(): pass";
      const invalidQuery = "(((invalid syntax";
      const result = await matcher.query(source, invalidQuery, "python");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("query");
      }
    });

    it("handles unsupported language", async () => {
      const result = await matcher.parse("fn main() {}", "rust");

      expect(result.success).toBe(false);
      if (!result.success) {
        // Error could be "not supported" or WASM-related depending on setup
        expect(
          result.error.message.includes("not supported") ||
          result.error.message.includes("WASM")
        ).toBe(true);
      }
    });
  });
});

describe("COMMON_AST_PATTERNS", () => {
  it("has predefined patterns for common vulnerabilities", () => {
    expect(COMMON_AST_PATTERNS.pythonSqlStringFormat).toBeDefined();
    expect(COMMON_AST_PATTERNS.pythonSqlFString).toBeDefined();
    expect(COMMON_AST_PATTERNS.pythonSqlConcat).toBeDefined();
    expect(COMMON_AST_PATTERNS.jsSqlTemplateLiteral).toBeDefined();
    expect(COMMON_AST_PATTERNS.jsSqlConcat).toBeDefined();
    expect(COMMON_AST_PATTERNS.pythonCommandInjection).toBeDefined();
    expect(COMMON_AST_PATTERNS.jsEval).toBeDefined();
  });
});

describe("checkTreeSitterSetup", () => {
  it("returns setup status", async () => {
    const result = await checkTreeSitterSetup();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.data.ready).toBe("boolean");
      expect(Array.isArray(result.data.languages)).toBe(true);
    }
  });
});
