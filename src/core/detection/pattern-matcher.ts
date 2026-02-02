import { readFile, readdir, stat } from "fs/promises";
import { resolve, extname } from "path";

import { DetectionResultSchema } from "../../categories/schema/index.js";
import { PinataError, AnalysisError, ParseError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { ok, err, tryCatchAsync } from "../../lib/result.js";

import {
  AstPatternMatcher,
  createAstMatcher,
  type AstMatch,
} from "./ast-parser.js";

import type {
  DetectionPattern,
  DetectionResult,
  Language,
  Confidence,
} from "../../categories/schema/index.js";
import type { Result } from "../../lib/result.js";



/**
 * File extension to language mapping
 */
const EXTENSION_TO_LANGUAGE: Record<string, Language> = {
  ".py": "python",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".go": "go",
  ".java": "java",
  ".rs": "rust",
};

/**
 * Maximum file size to scan (10MB)
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Maximum lines to include in snippet
 */
const MAX_SNIPPET_LINES = 5;

/**
 * Options for pattern matching
 */
export interface PatternMatcherOptions {
  /** Base directory for relative paths */
  basePath?: string;
  /** Maximum file size to scan in bytes */
  maxFileSize?: number;
  /** File extensions to include (e.g., ['.ts', '.py']) */
  includeExtensions?: string[];
  /** Directories to exclude (e.g., ['node_modules', '.git']) */
  excludeDirs?: string[];
  /** Whether to include hidden files */
  includeHidden?: boolean;
  /** Maximum depth for directory traversal (-1 for unlimited) */
  maxDepth?: number;
}

/**
 * Options for file scanning
 */
export interface ScanOptions extends PatternMatcherOptions {
  /** Category ID to associate with results */
  categoryId: string;
}

/**
 * Single match within a file
 */
export interface PatternMatch {
  /** The pattern that matched */
  pattern: DetectionPattern;
  /** Starting line number (1-indexed) */
  lineStart: number;
  /** Ending line number (1-indexed) */
  lineEnd: number;
  /** Column where match starts (0-indexed) */
  columnStart: number;
  /** Column where match ends (0-indexed) */
  columnEnd: number;
  /** The matched text */
  matchText: string;
  /** Code snippet with context */
  codeSnippet: string;
}

/**
 * Result of scanning a single file
 */
export interface FileScanResult {
  /** Path to the file */
  filePath: string;
  /** Detected language */
  language: Language | null;
  /** Pattern matches found */
  matches: PatternMatch[];
  /** Time taken to scan in milliseconds */
  scanTimeMs: number;
  /** Any warnings (e.g., file too large) */
  warnings: string[];
}

/**
 * Aggregated results across multiple files
 */
export interface AggregatedResults {
  /** Total files scanned */
  totalFiles: number;
  /** Files with at least one match */
  filesWithMatches: number;
  /** Total matches found */
  totalMatches: number;
  /** Results grouped by category ID */
  byCategory: Map<string, DetectionResult[]>;
  /** Results grouped by pattern ID */
  byPattern: Map<string, DetectionResult[]>;
  /** Results grouped by file path */
  byFile: Map<string, DetectionResult[]>;
  /** Results grouped by confidence level */
  byConfidence: Map<Confidence, DetectionResult[]>;
  /** Total scan time in milliseconds */
  totalScanTimeMs: number;
  /** Warnings encountered */
  warnings: string[];
}

/**
 * PatternMatcher - Core pattern detection engine
 *
 * Scans source files for patterns defined in categories and returns
 * structured detection results with file paths, line numbers, and
 * matched pattern details.
 *
 * Supports multiple pattern types:
 * - **regex**: Regular expression patterns (fast, broad matching)
 * - **ast**: Tree-sitter AST queries (precise, structural matching)
 * - **semantic**: LLM-assisted semantic analysis (future)
 *
 * @example
 * ```typescript
 * const matcher = new PatternMatcher();
 *
 * // Scan a single file
 * const patterns = category.detectionPatterns;
 * const result = await matcher.scanFile(filePath, patterns, {
 *   categoryId: category.id,
 * });
 *
 * // Scan a directory
 * const results = await matcher.scanDirectory(dirPath, patterns, {
 *   categoryId: category.id,
 *   excludeDirs: ['node_modules', '.git'],
 * });
 *
 * // Aggregate results
 * const aggregated = matcher.aggregateResults(results);
 * ```
 */
export class PatternMatcher {
  private readonly defaultOptions: Required<PatternMatcherOptions>;
  private readonly log = logger.child("PatternMatcher");
  private readonly astMatcher: AstPatternMatcher;
  private astAvailable: boolean | null = null;

  constructor(options: PatternMatcherOptions = {}) {
    this.defaultOptions = {
      basePath: process.cwd(),
      maxFileSize: options.maxFileSize ?? MAX_FILE_SIZE,
      includeExtensions: options.includeExtensions ?? Object.keys(EXTENSION_TO_LANGUAGE),
      excludeDirs: options.excludeDirs ?? ["node_modules", ".git", "dist", "build", "__pycache__", ".venv", "venv"],
      includeHidden: options.includeHidden ?? false,
      maxDepth: options.maxDepth ?? -1,
    };
    this.astMatcher = createAstMatcher();
  }

  /**
   * Check if AST pattern matching is available
   */
  isAstAvailable(): boolean {
    return this.astMatcher.getSupportedLanguages().length > 0;
  }

  /**
   * Get the AST matcher instance for direct access
   */
  getAstMatcher(): AstPatternMatcher {
    return this.astMatcher;
  }

  /**
   * Scan a single file for pattern matches
   *
   * @param filePath - Path to the file to scan
   * @param patterns - Detection patterns to match against
   * @param options - Scan options including categoryId
   * @returns Result containing FileScanResult or an error
   */
  async scanFile(
    filePath: string,
    patterns: DetectionPattern[],
    options: ScanOptions
  ): Promise<Result<FileScanResult, PinataError>> {
    const startTime = performance.now();
    const absolutePath = resolve(options.basePath ?? this.defaultOptions.basePath, filePath);
    const warnings: string[] = [];

    // Check file exists and get stats
    const statsResult = await tryCatchAsync(() => stat(absolutePath));
    if (!statsResult.success) {
      return err(new ParseError(`File not found: ${filePath}`, absolutePath));
    }

    const fileStats = statsResult.data;
    if (!fileStats.isFile()) {
      return err(new ParseError(`Not a file: ${filePath}`, absolutePath));
    }

    // Check file size
    const maxSize = options.maxFileSize ?? this.defaultOptions.maxFileSize;
    if (fileStats.size > maxSize) {
      warnings.push(`File exceeds maximum size (${fileStats.size} > ${maxSize})`);
      return ok({
        filePath: absolutePath,
        language: null,
        matches: [],
        scanTimeMs: performance.now() - startTime,
        warnings,
      });
    }

    // Determine language from extension
    const ext = extname(absolutePath).toLowerCase();
    const language = EXTENSION_TO_LANGUAGE[ext] ?? null;

    // Read file content
    const contentResult = await tryCatchAsync(() => readFile(absolutePath, "utf-8"));
    if (!contentResult.success) {
      return err(new ParseError(`Failed to read file: ${contentResult.error.message}`, absolutePath));
    }

    const content = contentResult.data;
    const lines = content.split("\n");

    // Filter patterns for this language
    const applicablePatterns = patterns.filter((p) => {
      if (language === null) return false;
      // TypeScript patterns also apply to JavaScript files
      if (p.language === "typescript" && language === "javascript") return true;
      if (p.language === "javascript" && language === "typescript") return true;
      return p.language === language;
    });

    // Match patterns
    const matches: PatternMatch[] = [];

    for (const pattern of applicablePatterns) {
      if (pattern.type === "regex") {
        const patternMatches = this.matchRegexPattern(pattern, content, lines);
        matches.push(...patternMatches);
      } else if (pattern.type === "ast") {
        // AST pattern matching using tree-sitter
        const astMatches = await this.matchAstPattern(pattern, content, lines, language!);
        matches.push(...astMatches);
      }
      // Semantic patterns to be implemented later (LLM-assisted)
    }

    // Apply negative patterns to filter false positives
    const filteredMatches = this.applyNegativePatterns(matches, content, patterns);

    return ok({
      filePath: absolutePath,
      language,
      matches: filteredMatches,
      scanTimeMs: performance.now() - startTime,
      warnings,
    });
  }

  /**
   * Scan a directory recursively for pattern matches
   *
   * @param dirPath - Path to the directory to scan
   * @param patterns - Detection patterns to match against
   * @param options - Scan options including categoryId
   * @returns Result containing array of DetectionResults or an error
   */
  async scanDirectory(
    dirPath: string,
    patterns: DetectionPattern[],
    options: ScanOptions
  ): Promise<Result<DetectionResult[], PinataError>> {
    const absolutePath = resolve(options.basePath ?? this.defaultOptions.basePath, dirPath);
    const results: DetectionResult[] = [];
    const warnings: string[] = [];

    // Get all files recursively
    const filesResult = await this.getFilesRecursive(absolutePath, 0, options);
    if (!filesResult.success) {
      return err(filesResult.error);
    }

    const files = filesResult.data;
    this.log.debug(`Scanning ${files.length} files in ${dirPath}`);

    // Scan each file
    for (const file of files) {
      const scanResult = await this.scanFile(file, patterns, {
        ...options,
        basePath: "", // Files are already absolute paths
      });

      if (scanResult.success) {
        warnings.push(...scanResult.data.warnings);

        // Convert matches to DetectionResults
        for (const match of scanResult.data.matches) {
          const detectionResult = this.matchToDetectionResult(
            match,
            file,
            options.categoryId
          );
          results.push(detectionResult);
        }
      } else {
        warnings.push(`Error scanning ${file}: ${scanResult.error.message}`);
      }
    }

    if (warnings.length > 0) {
      this.log.warn(`Scan completed with ${warnings.length} warnings`);
    }

    return ok(results);
  }

  /**
   * Aggregate detection results for analysis
   *
   * @param results - Array of detection results to aggregate
   * @param scanTimeMs - Total scan time in milliseconds
   * @returns Aggregated results with various groupings
   */
  aggregateResults(results: DetectionResult[], scanTimeMs: number = 0): AggregatedResults {
    const byCategory = new Map<string, DetectionResult[]>();
    const byPattern = new Map<string, DetectionResult[]>();
    const byFile = new Map<string, DetectionResult[]>();
    const byConfidence = new Map<Confidence, DetectionResult[]>();
    const filesWithMatches = new Set<string>();

    for (const result of results) {
      filesWithMatches.add(result.filePath);

      // Group by category
      if (!byCategory.has(result.categoryId)) {
        byCategory.set(result.categoryId, []);
      }
      byCategory.get(result.categoryId)!.push(result);

      // Group by pattern
      if (!byPattern.has(result.patternId)) {
        byPattern.set(result.patternId, []);
      }
      byPattern.get(result.patternId)!.push(result);

      // Group by file
      if (!byFile.has(result.filePath)) {
        byFile.set(result.filePath, []);
      }
      byFile.get(result.filePath)!.push(result);

      // Group by confidence
      if (!byConfidence.has(result.confidence)) {
        byConfidence.set(result.confidence, []);
      }
      byConfidence.get(result.confidence)!.push(result);
    }

    return {
      totalFiles: byFile.size,
      filesWithMatches: filesWithMatches.size,
      totalMatches: results.length,
      byCategory,
      byPattern,
      byFile,
      byConfidence,
      totalScanTimeMs: scanTimeMs,
      warnings: [],
    };
  }

  /**
   * Match a regex pattern against file content
   */
  private matchRegexPattern(
    pattern: DetectionPattern,
    content: string,
    lines: string[]
  ): PatternMatch[] {
    const matches: PatternMatch[] = [];

    try {
      // Create regex with global and multiline flags
      const regex = new RegExp(pattern.pattern, "gm");
      let match: RegExpExecArray | null;

      while ((match = regex.exec(content)) !== null) {
        // Calculate line number from offset
        const lineStart = this.getLineNumber(content, match.index);
        const lineEnd = this.getLineNumber(content, match.index + match[0].length);

        // Get column positions
        const lineStartOffset = this.getLineStartOffset(content, match.index);
        const columnStart = match.index - lineStartOffset;
        const columnEnd = columnStart + match[0].length;

        // Build code snippet with context
        const codeSnippet = this.buildCodeSnippet(lines, lineStart, lineEnd);

        matches.push({
          pattern,
          lineStart,
          lineEnd,
          columnStart,
          columnEnd,
          matchText: match[0],
          codeSnippet,
        });

        // Prevent infinite loops on zero-width matches
        if (match[0].length === 0) {
          regex.lastIndex++;
        }
      }
    } catch (e) {
      this.log.warn(`Invalid regex pattern '${pattern.id}': ${e}`);
    }

    return matches;
  }

  /**
   * Match an AST pattern against file content using tree-sitter
   *
   * AST patterns use tree-sitter query syntax for precise structural matching.
   * This is more accurate than regex for detecting code patterns that depend
   * on syntax structure (e.g., function calls, string interpolation).
   *
   * @param pattern Detection pattern with type === "ast"
   * @param content File content
   * @param lines File content split into lines
   * @param language Programming language
   * @returns Array of pattern matches
   */
  private async matchAstPattern(
    pattern: DetectionPattern,
    content: string,
    lines: string[],
    language: Language
  ): Promise<PatternMatch[]> {
    const matches: PatternMatch[] = [];

    // Check if AST parsing is available for this language
    if (!this.astMatcher.isLanguageSupported(language)) {
      this.log.debug(`AST parsing not available for ${language}, skipping pattern ${pattern.id}`);
      return matches;
    }

    try {
      const astResult = await this.astMatcher.query(content, pattern.pattern, language);

      if (!astResult.success) {
        this.log.warn(`AST query failed for pattern '${pattern.id}': ${astResult.error.message}`);
        return matches;
      }

      // Convert AST matches to PatternMatch format
      // Filter to only include matches with the main capture (typically @call or similar)
      const seenLocations = new Set<string>();

      for (const astMatch of astResult.data) {
        // Skip duplicate locations (same match can have multiple captures)
        const locationKey = `${astMatch.startLine}:${astMatch.startColumn}:${astMatch.endLine}:${astMatch.endColumn}`;
        if (seenLocations.has(locationKey)) {
          continue;
        }

        // Only include primary captures (skip helper captures like @method, @concat)
        // Primary captures are typically named @call, @match, @target, or similar
        const primaryCaptures = ["call", "match", "target", "vulnerable", "detection", "assertion"];
        const isPrimary = primaryCaptures.some((name) => astMatch.captureName.includes(name));

        if (!isPrimary && astMatch.captureName.startsWith("@") === false) {
          // This is a helper capture, skip it
          continue;
        }

        seenLocations.add(locationKey);

        // Convert from 0-indexed to 1-indexed line numbers
        const lineStart = astMatch.startLine + 1;
        const lineEnd = astMatch.endLine + 1;

        // Build code snippet
        const codeSnippet = this.buildCodeSnippet(lines, lineStart, lineEnd);

        matches.push({
          pattern,
          lineStart,
          lineEnd,
          columnStart: astMatch.startColumn,
          columnEnd: astMatch.endColumn,
          matchText: astMatch.text,
          codeSnippet,
        });
      }
    } catch (e) {
      this.log.warn(`AST pattern error '${pattern.id}': ${e instanceof Error ? e.message : String(e)}`);
    }

    return matches;
  }

  /**
   * Detect AST patterns in source code
   *
   * Convenience method for direct AST pattern detection without going through
   * the full scanFile flow. Useful for testing and one-off queries.
   *
   * @param source Source code content
   * @param query Tree-sitter query string
   * @param language Programming language
   * @returns AST matches or error
   */
  async detectAstPattern(
    source: string,
    query: string,
    language: Language
  ): Promise<Result<AstMatch[], PinataError>> {
    if (!this.astMatcher.isLanguageSupported(language)) {
      return err(new AnalysisError(`AST parsing not supported for ${language}`));
    }

    return this.astMatcher.query(source, query, language);
  }

  /**
   * Apply negative patterns to filter out false positives
   */
  private applyNegativePatterns(
    matches: PatternMatch[],
    content: string,
    patterns: DetectionPattern[]
  ): PatternMatch[] {
    return matches.filter((match) => {
      const negativePattern = match.pattern.negativePattern;
      if (!negativePattern) return true;

      try {
        const negativeRegex = new RegExp(negativePattern);
        // Check if the matched code or surrounding context matches the negative pattern
        const surroundingCode = this.getSurroundingCode(content, match);
        return !negativeRegex.test(surroundingCode);
      } catch {
        return true; // Invalid negative pattern, keep the match
      }
    });
  }

  /**
   * Get code surrounding a match for negative pattern checking
   */
  private getSurroundingCode(content: string, match: PatternMatch): string {
    const lines = content.split("\n");
    const startLine = Math.max(0, match.lineStart - 3);
    const endLine = Math.min(lines.length, match.lineEnd + 2);
    return lines.slice(startLine, endLine).join("\n");
  }

  /**
   * Get line number from character offset
   */
  private getLineNumber(content: string, offset: number): number {
    let line = 1;
    for (let i = 0; i < offset && i < content.length; i++) {
      if (content[i] === "\n") {
        line++;
      }
    }
    return line;
  }

  /**
   * Get the character offset of the start of the line containing the given offset
   */
  private getLineStartOffset(content: string, offset: number): number {
    let lineStart = offset;
    while (lineStart > 0 && content[lineStart - 1] !== "\n") {
      lineStart--;
    }
    return lineStart;
  }

  /**
   * Build a code snippet with context around the match
   */
  private buildCodeSnippet(lines: string[], lineStart: number, lineEnd: number): string {
    const startLine = Math.max(0, lineStart - 2); // 1 line before
    const endLine = Math.min(lines.length, lineEnd + 1); // 1 line after

    // Limit snippet size
    const snippetLines = lines.slice(startLine, Math.min(endLine, startLine + MAX_SNIPPET_LINES));

    return snippetLines
      .map((line, i) => {
        const lineNum = startLine + i + 1;
        const marker = lineNum >= lineStart && lineNum <= lineEnd ? ">" : " ";
        return `${marker} ${lineNum.toString().padStart(4)}| ${line}`;
      })
      .join("\n");
  }

  /**
   * Convert a PatternMatch to a DetectionResult
   */
  private matchToDetectionResult(
    match: PatternMatch,
    filePath: string,
    categoryId: string
  ): DetectionResult {
    return DetectionResultSchema.parse({
      patternId: match.pattern.id,
      categoryId,
      filePath,
      lineStart: match.lineStart,
      lineEnd: match.lineEnd,
      codeSnippet: match.codeSnippet,
      confidence: match.pattern.confidence,
      context: {
        matchText: match.matchText,
        columnStart: match.columnStart,
        columnEnd: match.columnEnd,
        patternDescription: match.pattern.description,
      },
    });
  }

  /**
   * Recursively get all files in a directory
   */
  private async getFilesRecursive(
    dirPath: string,
    currentDepth: number,
    options: PatternMatcherOptions
  ): Promise<Result<string[], PinataError>> {
    const maxDepth = options.maxDepth ?? this.defaultOptions.maxDepth;
    if (maxDepth !== -1 && currentDepth > maxDepth) {
      return ok([]);
    }

    const entriesResult = await tryCatchAsync(() => readdir(dirPath, { withFileTypes: true }));
    if (!entriesResult.success) {
      return err(new AnalysisError(`Failed to read directory: ${dirPath}`, {
        cause: entriesResult.error.message,
      }));
    }

    const files: string[] = [];
    const excludeDirs = options.excludeDirs ?? this.defaultOptions.excludeDirs;
    const includeExtensions = options.includeExtensions ?? this.defaultOptions.includeExtensions;
    const includeHidden = options.includeHidden ?? this.defaultOptions.includeHidden;

    for (const entry of entriesResult.data) {
      // Skip hidden files/directories unless explicitly included
      if (!includeHidden && entry.name.startsWith(".")) {
        continue;
      }

      const fullPath = resolve(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Skip excluded directories
        if (excludeDirs.includes(entry.name)) {
          continue;
        }

        // Recurse into subdirectory
        const subFilesResult = await this.getFilesRecursive(fullPath, currentDepth + 1, options);
        if (subFilesResult.success) {
          files.push(...subFilesResult.data);
        }
      } else if (entry.isFile()) {
        // Check file extension
        const ext = extname(entry.name).toLowerCase();
        if (includeExtensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }

    return ok(files);
  }
}

/**
 * Create a PatternMatcher instance
 */
export function createPatternMatcher(options?: PatternMatcherOptions): PatternMatcher {
  return new PatternMatcher(options);
}

/**
 * Detect language from file extension
 */
export function detectLanguage(filePath: string): Language | null {
  const ext = extname(filePath).toLowerCase();
  return EXTENSION_TO_LANGUAGE[ext] ?? null;
}

/**
 * Get supported file extensions
 */
export function getSupportedExtensions(): string[] {
  return Object.keys(EXTENSION_TO_LANGUAGE);
}

/**
 * Check if a file extension is supported
 */
export function isExtensionSupported(ext: string): boolean {
  return ext.toLowerCase() in EXTENSION_TO_LANGUAGE;
}
