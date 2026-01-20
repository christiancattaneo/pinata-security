/**
 * Tree-sitter AST Parser
 *
 * Provides AST parsing and querying capabilities using web-tree-sitter.
 * Supports Python, TypeScript, and JavaScript.
 */

import {
  Parser as TreeSitterParser,
  Language as TreeSitterLanguage,
  Tree as TreeSitterTree,
  Node as TreeSitterNode,
  Query as TreeSitterQuery,
} from "web-tree-sitter";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

import { ok, err } from "../../lib/result.js";
import type { Result } from "../../lib/result.js";
import { PinataError, ParseError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import type { Language } from "../../categories/schema/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Map of language to tree-sitter grammar name
 */
const LANGUAGE_GRAMMAR_MAP: Record<Language, string | null> = {
  python: "tree-sitter-python",
  typescript: "tree-sitter-typescript",
  javascript: "tree-sitter-javascript",
  go: null, // Not yet supported
  java: null, // Not yet supported
  rust: null, // Not yet supported
};

/**
 * AST match result
 */
export interface AstMatch {
  /** Matched node text */
  text: string;
  /** Node type (e.g., "call_expression") */
  nodeType: string;
  /** Starting line (0-indexed) */
  startLine: number;
  /** Ending line (0-indexed) */
  endLine: number;
  /** Starting column (0-indexed) */
  startColumn: number;
  /** Ending column (0-indexed) */
  endColumn: number;
  /** Capture name from the query (e.g., "@call") */
  captureName: string;
  /** Child captures from the same match group */
  captures: Map<string, string>;
}

/**
 * Query match with all captures
 */
interface QueryMatch {
  pattern: number;
  captures: Array<{
    name: string;
    node: TreeSitterNode;
  }>;
}

/**
 * Cached parser instances per language
 */
const parserCache = new Map<string, TreeSitterParser>();

/**
 * Cached language instances
 */
const languageCache = new Map<string, TreeSitterLanguage>();

/**
 * Whether Parser has been initialized
 */
let parserInitialized = false;

/**
 * WASM file locations - tries multiple paths
 * web-tree-sitter uses web-tree-sitter.wasm as the main parser WASM file
 */
function getWasmPaths(): string[] {
  return [
    // Development: relative to project root
    join(process.cwd(), "node_modules/web-tree-sitter/web-tree-sitter.wasm"),
    // Built: relative to dist
    join(__dirname, "../../../node_modules/web-tree-sitter/web-tree-sitter.wasm"),
    // Alternative locations
    join(__dirname, "../../wasm/web-tree-sitter.wasm"),
    join(process.cwd(), "wasm/web-tree-sitter.wasm"),
  ];
}

/**
 * Language WASM file locations
 */
function getLanguageWasmPaths(language: string): string[] {
  const grammarName = `tree-sitter-${language}`;
  const wasmName = `${grammarName}.wasm`;

  return [
    // Project wasm directory (recommended)
    join(process.cwd(), "wasm", wasmName),
    // src directory
    join(process.cwd(), "src/core/detection/wasm", wasmName),
    // Fallback locations
    join(__dirname, "wasm", wasmName),
    join(__dirname, "../../../wasm", wasmName),
  ];
}

/**
 * Initialize the tree-sitter Parser
 */
async function initializeParser(): Promise<Result<void, PinataError>> {
  if (parserInitialized) {
    return ok(undefined);
  }

  const wasmPaths = getWasmPaths();
  let wasmPath: string | null = null;

  for (const path of wasmPaths) {
    if (existsSync(path)) {
      wasmPath = path;
      break;
    }
  }

  if (!wasmPath) {
    return err(
      new ParseError(
        "tree-sitter.wasm not found. Run: npm run setup:wasm",
        "tree-sitter.wasm"
      )
    );
  }

  try {
    await TreeSitterParser.init({
      locateFile: () => wasmPath!,
    });
    parserInitialized = true;
    logger.debug("Tree-sitter initialized");
    return ok(undefined);
  } catch (error) {
    return err(
      new ParseError(
        `Failed to initialize tree-sitter: ${error instanceof Error ? error.message : String(error)}`,
        wasmPath
      )
    );
  }
}

/**
 * Load a language grammar
 */
async function loadLanguage(language: Language): Promise<Result<TreeSitterLanguage, PinataError>> {
  const grammarName = LANGUAGE_GRAMMAR_MAP[language];

  if (grammarName === null) {
    return err(
      new ParseError(`Language not supported for AST parsing: ${language}`, language)
    );
  }

  // Check cache
  const cached = languageCache.get(language);
  if (cached) {
    return ok(cached);
  }

  // Handle TypeScript special case (uses typescript grammar from tree-sitter-typescript)
  const langKey = language === "typescript" ? "typescript" : language;
  const wasmPaths = getLanguageWasmPaths(langKey);

  let wasmPath: string | null = null;
  for (const path of wasmPaths) {
    if (existsSync(path)) {
      wasmPath = path;
      break;
    }
  }

  if (!wasmPath) {
    return err(
      new ParseError(
        `Language WASM not found for ${language}. Run: npm run setup:wasm`,
        language
      )
    );
  }

  try {
    const lang = await TreeSitterLanguage.load(wasmPath);
    languageCache.set(language, lang);
    logger.debug(`Loaded language: ${language}`);
    return ok(lang);
  } catch (error) {
    return err(
      new ParseError(
        `Failed to load language ${language}: ${error instanceof Error ? error.message : String(error)}`,
        wasmPath
      )
    );
  }
}

/**
 * Get or create a parser for a specific language
 */
async function getParser(language: Language): Promise<Result<TreeSitterParser, PinataError>> {
  // Initialize if needed
  const initResult = await initializeParser();
  if (!initResult.success) {
    return initResult;
  }

  // Check cache
  const cached = parserCache.get(language);
  if (cached) {
    return ok(cached);
  }

  // Load language
  const langResult = await loadLanguage(language);
  if (!langResult.success) {
    return langResult;
  }

  // Create parser
  const parser = new TreeSitterParser();
  parser.setLanguage(langResult.data);
  parserCache.set(language, parser);

  return ok(parser);
}

/**
 * Parse source code into an AST
 */
export async function parseSource(
  source: string,
  language: Language
): Promise<Result<TreeSitterTree, PinataError>> {
  const parserResult = await getParser(language);
  if (!parserResult.success) {
    return parserResult;
  }

  try {
    const tree = parserResult.data.parse(source);
    if (!tree) {
      return err(
        new ParseError("Failed to parse source: parser returned null", "source")
      );
    }
    return ok(tree);
  } catch (error) {
    return err(
      new ParseError(
        `Failed to parse source: ${error instanceof Error ? error.message : String(error)}`,
        "source"
      )
    );
  }
}

/**
 * Execute a tree-sitter query against an AST
 *
 * Query syntax follows tree-sitter query format:
 * https://tree-sitter.github.io/tree-sitter/using-parsers#pattern-matching-with-queries
 *
 * @example
 * ```typescript
 * // Find all function calls
 * const query = "(call_expression) @call";
 *
 * // Find SQL execute with string concatenation
 * const query = `
 *   (call_expression
 *     function: (attribute
 *       attribute: (identifier) @method)
 *     arguments: (argument_list
 *       (binary_operator) @concat))
 *   (#match? @method "execute|executemany")
 *   @call
 * `;
 * ```
 */
export async function executeQuery(
  tree: TreeSitterTree,
  queryString: string,
  language: Language
): Promise<Result<AstMatch[], PinataError>> {
  const langResult = await loadLanguage(language);
  if (!langResult.success) {
    return langResult;
  }

  try {
    // Create query from language
    const query = new TreeSitterQuery(langResult.data, queryString);
    const matches = query.matches(tree.rootNode);

    const results: AstMatch[] = [];

    for (const match of matches) {
      // Get all captures for this match
      const captureMap = new Map<string, string>();
      for (const capture of match.captures) {
        captureMap.set(capture.name, capture.node.text);
      }

      // Create a result for each capture
      for (const capture of match.captures) {
        const node = capture.node;
        results.push({
          text: node.text,
          nodeType: node.type,
          startLine: node.startPosition.row,
          endLine: node.endPosition.row,
          startColumn: node.startPosition.column,
          endColumn: node.endPosition.column,
          captureName: capture.name,
          captures: captureMap,
        });
      }
    }

    return ok(results);
  } catch (error) {
    return err(
      new ParseError(
        `Failed to execute query: ${error instanceof Error ? error.message : String(error)}`,
        "query"
      )
    );
  }
}

/**
 * AstPatternMatcher - Executes AST queries against source code
 *
 * Provides a higher-level interface for pattern detection using tree-sitter.
 */
export class AstPatternMatcher {
  private readonly sourceCache = new Map<string, TreeSitterTree>();
  private readonly log = logger.child("AstPatternMatcher");

  /**
   * Check if AST parsing is available for a language
   */
  isLanguageSupported(language: Language): boolean {
    return LANGUAGE_GRAMMAR_MAP[language] !== null;
  }

  /**
   * Get list of supported languages
   */
  getSupportedLanguages(): Language[] {
    return Object.entries(LANGUAGE_GRAMMAR_MAP)
      .filter(([_, grammar]) => grammar !== null)
      .map(([lang]) => lang as Language);
  }

  /**
   * Parse source code and cache the AST
   */
  async parse(
    source: string,
    language: Language,
    cacheKey?: string
  ): Promise<Result<TreeSitterTree, PinataError>> {
    // Check cache
    if (cacheKey) {
      const cached = this.sourceCache.get(cacheKey);
      if (cached) {
        return ok(cached);
      }
    }

    const result = await parseSource(source, language);
    if (result.success && cacheKey) {
      this.sourceCache.set(cacheKey, result.data);
    }

    return result;
  }

  /**
   * Execute a query against source code
   *
   * @param source Source code to analyze
   * @param query Tree-sitter query string
   * @param language Programming language
   * @param cacheKey Optional cache key for the parsed AST
   */
  async query(
    source: string,
    query: string,
    language: Language,
    cacheKey?: string
  ): Promise<Result<AstMatch[], PinataError>> {
    const treeResult = await this.parse(source, language, cacheKey);
    if (!treeResult.success) {
      return treeResult;
    }

    return executeQuery(treeResult.data, query, language);
  }

  /**
   * Execute multiple queries against the same source
   */
  async queryMultiple(
    source: string,
    queries: string[],
    language: Language,
    cacheKey?: string
  ): Promise<Result<AstMatch[][], PinataError>> {
    const treeResult = await this.parse(source, language, cacheKey);
    if (!treeResult.success) {
      return treeResult;
    }

    const results: AstMatch[][] = [];
    for (const query of queries) {
      const queryResult = await executeQuery(treeResult.data, query, language);
      if (!queryResult.success) {
        return queryResult;
      }
      results.push(queryResult.data);
    }

    return ok(results);
  }

  /**
   * Clear the AST cache
   */
  clearCache(): void {
    this.sourceCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { entries: number; languages: Set<string> } {
    return {
      entries: this.sourceCache.size,
      languages: new Set(parserCache.keys()),
    };
  }
}

/**
 * Create a new AstPatternMatcher instance
 */
export function createAstMatcher(): AstPatternMatcher {
  return new AstPatternMatcher();
}

/**
 * Predefined AST queries for common vulnerability patterns
 */
export const COMMON_AST_PATTERNS = {
  // Python: SQL injection via string formatting
  pythonSqlStringFormat: `
    (call
      function: (attribute
        attribute: (identifier) @method)
      arguments: (argument_list
        (binary_operator
          operator: "%") @concat))
    (#match? @method "^execute$|^executemany$")
    @call
  `,

  // Python: SQL injection via f-string
  pythonSqlFString: `
    (call
      function: (attribute
        attribute: (identifier) @method)
      arguments: (argument_list
        (string
          (interpolation)) @fstring))
    (#match? @method "^execute$|^executemany$")
    @call
  `,

  // Python: SQL injection via concatenation
  pythonSqlConcat: `
    (call
      function: (attribute
        attribute: (identifier) @method)
      arguments: (argument_list
        (binary_operator
          operator: "+") @concat))
    (#match? @method "^execute$|^executemany$")
    @call
  `,

  // Python: SQL injection via .format()
  pythonSqlFormat: `
    (call
      function: (attribute
        attribute: (identifier) @method)
      arguments: (argument_list
        (call
          function: (attribute
            attribute: (identifier) @format_method))))
    (#match? @method "^execute$|^executemany$")
    (#match? @format_method "^format$")
    @call
  `,

  // JavaScript/TypeScript: SQL injection via template literal
  jsSqlTemplateLiteral: `
    (call_expression
      function: (member_expression
        property: (property_identifier) @method)
      arguments: (arguments
        (template_string
          (template_substitution)) @template))
    (#match? @method "^query$|^execute$|^run$")
    @call
  `,

  // JavaScript/TypeScript: SQL injection via concatenation
  jsSqlConcat: `
    (call_expression
      function: (member_expression
        property: (property_identifier) @method)
      arguments: (arguments
        (binary_expression
          operator: "+") @concat))
    (#match? @method "^query$|^execute$|^run$")
    @call
  `,

  // Python: Command injection via subprocess
  pythonCommandInjection: `
    (call
      function: (attribute
        object: (identifier) @module
        attribute: (identifier) @method)
      arguments: (argument_list
        (binary_operator) @concat))
    (#match? @module "^subprocess$|^os$")
    (#match? @method "^call$|^run$|^Popen$|^system$")
    @call
  `,

  // Python: Path traversal via open
  pythonPathTraversal: `
    (call
      function: (identifier) @func
      arguments: (argument_list
        (binary_operator
          operator: "+") @concat))
    (#match? @func "^open$")
    @call
  `,

  // JavaScript: eval usage
  jsEval: `
    (call_expression
      function: (identifier) @func)
    (#match? @func "^eval$")
    @call
  `,

  // TypeScript: Any type assertion
  tsAnyAssertion: `
    (as_expression
      type: (type_identifier) @type)
    (#match? @type "^any$")
    @assertion
  `,
} as const;

/**
 * Check if tree-sitter is properly initialized
 */
export async function checkTreeSitterSetup(): Promise<Result<{ ready: boolean; languages: Language[] }, PinataError>> {
  const initResult = await initializeParser();
  if (!initResult.success) {
    logger.debug(`Tree-sitter init failed: ${initResult.error.message}`);
    return ok({ ready: false, languages: [] });
  }

  const supportedLanguages: Language[] = [];
  for (const lang of ["python", "typescript", "javascript"] as Language[]) {
    const langResult = await loadLanguage(lang);
    if (langResult.success) {
      supportedLanguages.push(lang);
    } else {
      logger.debug(`Failed to load language ${lang}: ${langResult.error.message}`);
    }
  }

  return ok({
    ready: supportedLanguages.length > 0,
    languages: supportedLanguages,
  });
}
