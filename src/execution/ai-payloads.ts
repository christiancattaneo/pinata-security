/**
 * Layer 5: AI-Crafted Payload Generator
 * 
 * Uses AI to analyze code context and generate targeted exploit payloads.
 * More effective than generic payloads because they're crafted for the
 * specific implementation.
 */

import type { Gap } from "../core/scanner/types.js";
import { getPayloadsForCategory, mutatePayload } from "./payloads.js";

/** AI-generated payload result */
export interface AiPayload {
  /** The exploit payload */
  payload: string;
  /** Why this payload targets the specific code */
  rationale: string;
  /** Expected behavior if vulnerable */
  expectedIfVulnerable: string;
  /** Expected behavior if not vulnerable */
  expectedIfSafe: string;
  /** Confidence in this payload's effectiveness */
  confidence: "high" | "medium" | "low";
}

/** Context for AI payload generation */
export interface PayloadContext {
  /** The detected gap */
  gap: Gap;
  /** The vulnerable code snippet */
  code: string;
  /** Surrounding code context */
  context: string;
  /** Technology stack hints */
  techStack: TechStackHints;
}

/** Technology stack hints extracted from code */
export interface TechStackHints {
  framework?: string;       // express, fastify, django, etc.
  database?: string;        // postgres, mysql, mongodb, etc.
  orm?: string;             // prisma, sequelize, typeorm, etc.
  language: string;         // typescript, python, go, etc.
  hasWaf?: boolean;         // Web Application Firewall detected
  hasEscaping?: boolean;    // Escaping functions detected
}

/**
 * System prompt for AI payload generation
 */
export const AI_PAYLOAD_SYSTEM_PROMPT = `You are an expert penetration tester and security researcher.
Your task is to analyze vulnerable code and generate targeted exploit payloads.

You will receive:
1. A code snippet containing a potential vulnerability
2. The vulnerability type (SQL injection, XSS, etc.)
3. Technology stack information

Your job is to:
1. Analyze the specific implementation
2. Identify exactly how the vulnerability can be exploited
3. Generate 3-5 targeted payloads that exploit this specific code
4. Consider any defenses (escaping, WAF, etc.) and suggest bypasses

Focus on PRACTICAL exploitation, not theoretical vulnerabilities.
Consider:
- The exact syntax of the vulnerable code
- Variable names and data flow
- Framework-specific behaviors
- Database/ORM quirks
- WAF bypass techniques

Return payloads in JSON format:
{
  "analysis": "Brief analysis of the vulnerability",
  "payloads": [
    {
      "payload": "the exploit string",
      "rationale": "why this targets this specific code",
      "expectedIfVulnerable": "what happens if it works",
      "expectedIfSafe": "what happens if protected",
      "confidence": "high|medium|low"
    }
  ]
}`;

/**
 * Generate payload prompt for specific vulnerability
 */
export function generatePayloadPrompt(context: PayloadContext): string {
  const { gap, code, techStack } = context;
  
  return `Analyze this ${gap.categoryId} vulnerability and generate targeted exploit payloads.

## Vulnerability Type
${gap.categoryId}

## Vulnerable Code
\`\`\`${techStack.language}
${code}
\`\`\`

## Technology Stack
- Language: ${techStack.language}
- Framework: ${techStack.framework ?? "unknown"}
- Database: ${techStack.database ?? "unknown"}
- ORM: ${techStack.orm ?? "unknown"}
- Has WAF: ${techStack.hasWaf ? "yes" : "no/unknown"}
- Has Escaping: ${techStack.hasEscaping ? "yes" : "no/unknown"}

## Detection Context
- File: ${gap.filePath}
- Line: ${gap.lineStart}
- Pattern: ${gap.categoryId}

Generate 3-5 targeted payloads that would exploit THIS SPECIFIC code.
Consider the exact variable names, function calls, and data flow shown above.`;
}

/** Lookup table: keyword → framework name */
const FRAMEWORK_PATTERNS: Array<[string[], string]> = [
  [["express", "app.get", "app.post"], "express"],
  [["fastify"], "fastify"],
  [["django", "from django"], "django"],
  [["flask", "from flask"], "flask"],
  [["gin."], "gin"],
  [["fiber."], "fiber"],
];

/** Lookup table: keyword → database name */
const DATABASE_PATTERNS: Array<[string[], string]> = [
  [["postgres", "pg."], "postgres"],
  [["mysql"], "mysql"],
  [["mongodb", "mongoose", "$where"], "mongodb"],
  [["sqlite", "sqlite3"], "sqlite"],
];

/** Lookup table: keyword → ORM name */
const ORM_PATTERNS: Array<[string[], string]> = [
  [["prisma"], "prisma"],
  [["sequelize"], "sequelize"],
  [["typeorm", "TypeORM"], "typeorm"],
  [["sqlalchemy", "SQLAlchemy"], "sqlalchemy"],
];

/** Keywords indicating input escaping/sanitization */
const ESCAPING_KEYWORDS = ["escape", "sanitize", "DOMPurify", "htmlspecialchars"];

/** Keywords indicating WAF presence */
const WAF_KEYWORDS = ["waf", "WAF", "cloudflare", "akamai"];

/** Language extension lookup */
const LANGUAGE_EXTENSIONS: Record<string, string> = {
  ".ts": "typescript", ".tsx": "typescript",
  ".js": "javascript", ".jsx": "javascript",
  ".py": "python", ".go": "go", ".java": "java",
  ".rb": "ruby", ".php": "php",
};

/**
 * Find first matching pattern group in code
 */
function matchFirst(code: string, patterns: Array<[string[], string]>): string | undefined {
  for (const [keywords, name] of patterns) {
    if (keywords.some((k) => code.includes(k))) {
      return name;
    }
  }
  return undefined;
}

/**
 * Extract technology stack hints from code
 */
export function extractTechStack(code: string, filePath: string): TechStackHints {
  const ext = "." + (filePath.split(".").pop() ?? "");

  return {
    language: LANGUAGE_EXTENSIONS[ext] ?? "unknown",
    framework: matchFirst(code, FRAMEWORK_PATTERNS),
    database: matchFirst(code, DATABASE_PATTERNS),
    orm: matchFirst(code, ORM_PATTERNS),
    hasEscaping: ESCAPING_KEYWORDS.some((k) => code.includes(k)),
    hasWaf: WAF_KEYWORDS.some((k) => code.includes(k)),
  };
}

/**
 * Parse AI response into structured payloads
 */
export function parseAiPayloadResponse(response: string): AiPayload[] {
  try {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*"payloads"[\s\S]*\}/);
    if (!jsonMatch) {
      return [];
    }
    
    const parsed = JSON.parse(jsonMatch[0]) as {
      payloads?: AiPayload[];
    };
    
    if (!parsed.payloads || !Array.isArray(parsed.payloads)) {
      return [];
    }
    
    // Validate and return payloads
    return parsed.payloads.filter((p): p is AiPayload =>
      typeof p.payload === "string" &&
      typeof p.rationale === "string" &&
      p.payload.length > 0
    );
  } catch {
    return [];
  }
}

/**
 * Combine AI-generated payloads with base payloads
 */
export function combinePayloads(
  aiPayloads: AiPayload[],
  categoryId: string,
  maxTotal: number = 20
): string[] {
  // AI payloads first (higher priority)
  const aiStrings = aiPayloads.map(p => p.payload);
  
  // Base payloads as fallback
  const basePayloads = getPayloadsForCategory(categoryId);
  
  // Combine, dedupe, and limit
  const combined = [...new Set([...aiStrings, ...basePayloads])];
  
  return combined.slice(0, maxTotal);
}

/**
 * Generate fallback payloads when AI is unavailable
 */
export function getFallbackPayloads(
  context: PayloadContext,
  maxPayloads: number = 10
): string[] {
  const { gap, techStack } = context;
  const categoryId = gap.categoryId;
  
  // Get base payloads
  let payloads = getPayloadsForCategory(categoryId);
  
  // Add tech-specific mutations
  if (techStack.database === "postgres") {
    // PostgreSQL uses $1, $2 for params and has specific syntax
    if (categoryId === "sql-injection") {
      payloads = payloads.concat([
        "1; SELECT pg_sleep(5)--",
        "1' OR '1'='1' -- ",
        "1 UNION SELECT NULL,NULL,version()--",
      ]);
    }
  } else if (techStack.database === "mongodb") {
    // MongoDB/NoSQL specific
    if (categoryId === "sql-injection") {
      payloads = payloads.concat([
        '{"$gt": ""}',
        '{"$ne": null}',
        '{"$regex": ".*"}',
        '{"$where": "1==1"}',
      ]);
    }
  }
  
  // Add WAF bypass mutations if WAF detected
  if (techStack.hasWaf) {
    payloads = payloads.flatMap(p => mutatePayload(p, 3));
  }
  
  return [...new Set(payloads)].slice(0, maxPayloads);
}
