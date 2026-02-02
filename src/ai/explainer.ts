/**
 * Gap Explainer
 *
 * Uses AI to generate natural language explanations of detected gaps.
 */

import { createAIService } from "./service.js";

import type { AIConfig, AIResponse, GapExplanation } from "./types.js";
import type { Category } from "../categories/schema/index.js";
import type { Gap } from "../core/scanner/types.js";

const SYSTEM_PROMPT = `You are a security expert explaining code vulnerabilities to developers.
Your explanations should be:
- Clear and actionable
- Focused on the specific code pattern
- Include concrete remediation steps
- Reference relevant security standards (OWASP, CWE) when applicable

Always respond with valid JSON matching this structure:
{
  "summary": "1-2 sentence summary",
  "explanation": "Detailed explanation of the vulnerability",
  "risk": "What an attacker could do if this is exploited",
  "remediation": "Step-by-step instructions to fix",
  "safeExample": "Code example showing the safe pattern",
  "references": ["optional array of CVE/CWE/OWASP references"]
}`;

/**
 * Explain a single gap
 */
export async function explainGap(
  gap: Gap,
  category?: Category,
  config?: Partial<AIConfig>
): Promise<AIResponse<GapExplanation>> {
  const ai = createAIService(config);

  if (!ai.isConfigured()) {
    return {
      success: false,
      error: "AI service not configured",
      durationMs: 0,
    };
  }

  const prompt = buildExplainPrompt(gap, category);

  const response = await ai.completeJSON<GapExplanation>({
    systemPrompt: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
    maxTokens: 1024,
    temperature: 0.3,
  });

  return response;
}

/**
 * Explain multiple gaps in batch
 */
export async function explainGaps(
  gaps: Gap[],
  categories?: Map<string, Category>,
  config?: Partial<AIConfig>
): Promise<Map<string, AIResponse<GapExplanation>>> {
  const results = new Map<string, AIResponse<GapExplanation>>();

  // Process in parallel with concurrency limit
  const BATCH_SIZE = 5;

  for (let i = 0; i < gaps.length; i += BATCH_SIZE) {
    const batch = gaps.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (gap) => {
      const category = categories?.get(gap.categoryId);
      const result = await explainGap(gap, category, config);
      return { key: `${gap.filePath}:${gap.lineStart}:${gap.categoryId}`, result };
    });

    const batchResults = await Promise.all(promises);
    for (const { key, result } of batchResults) {
      results.set(key, result);
    }
  }

  return results;
}

/**
 * Build the explanation prompt for a gap
 */
function buildExplainPrompt(gap: Gap, category?: Category): string {
  const parts: string[] = [];

  parts.push(`Explain this security finding:\n`);

  parts.push(`**Category:** ${gap.categoryName} (${gap.categoryId})`);
  parts.push(`**Severity:** ${gap.severity}`);
  parts.push(`**Confidence:** ${gap.confidence}`);
  parts.push(`**File:** ${gap.filePath}`);
  parts.push(`**Line:** ${gap.lineStart}`);

  if (gap.codeSnippet) {
    parts.push(`\n**Code:**\n\`\`\`\n${gap.codeSnippet}\n\`\`\``);
  }

  parts.push(`\n**Pattern:** ${gap.patternId}`);
  parts.push(`**Detection Type:** ${gap.patternType}`);

  if (category) {
    parts.push(`\n**Category Description:** ${category.description}`);

    if (category.cves && category.cves.length > 0) {
      parts.push(`**Related CVEs:** ${category.cves.join(", ")}`);
    }

    if (category.references && category.references.length > 0) {
      parts.push(`**References:** ${category.references.slice(0, 3).join(", ")}`);
    }
  }

  parts.push(`\nProvide a clear, actionable explanation for a developer.`);

  return parts.join("\n");
}

/**
 * Generate a quick summary without AI (fallback)
 */
export function generateFallbackExplanation(gap: Gap): GapExplanation {
  const summaries: Record<string, string> = {
    "sql-injection": "SQL query constructed with user input may allow injection attacks.",
    "xss": "User input rendered without escaping may allow script injection.",
    "command-injection": "Shell command constructed with user input may allow command execution.",
    "path-traversal": "File path constructed with user input may allow directory traversal.",
    "hardcoded-secrets": "Sensitive credentials found in source code.",
    "deserialization": "Untrusted data deserialization may allow code execution.",
    "ssrf": "Server-side request with user-controlled URL may allow internal access.",
    "xxe": "XML parser may be vulnerable to external entity injection.",
    "csrf": "State-changing request lacks CSRF protection.",
    "ldap-injection": "LDAP query constructed with user input may allow injection.",
  };

  const remediations: Record<string, string> = {
    "sql-injection": "Use parameterized queries or prepared statements. Never concatenate user input into SQL strings.",
    "xss": "Escape all user input before rendering in HTML. Use framework auto-escaping features.",
    "command-injection": "Avoid shell execution with user input. Use allowlists and subprocess arrays instead of shell strings.",
    "path-traversal": "Validate and sanitize file paths. Use path.resolve() and verify the result is within allowed directories.",
    "hardcoded-secrets": "Move secrets to environment variables or a secrets manager. Never commit credentials to source control.",
    "deserialization": "Avoid deserializing untrusted data. If necessary, use safe formats like JSON instead of pickle/yaml.",
    "ssrf": "Validate and allowlist URLs. Block private IP ranges and localhost.",
    "xxe": "Disable external entity processing in XML parser configuration.",
    "csrf": "Implement CSRF tokens for all state-changing requests.",
    "ldap-injection": "Escape special LDAP characters in user input. Use parameterized LDAP queries.",
  };

  const summary = summaries[gap.categoryId] ?? `Potential ${gap.categoryName} vulnerability detected.`;
  const remediation = remediations[gap.categoryId] ?? `Review the code for security issues and apply appropriate fixes.`;

  return {
    summary,
    explanation: `The pattern "${gap.patternId}" detected a potential ${gap.categoryName} vulnerability at line ${gap.lineStart}. This type of issue has ${gap.severity} severity and was detected with ${gap.confidence} confidence.`,
    risk: `If exploited, this vulnerability could compromise the security of the application. Severity: ${gap.severity}.`,
    remediation,
    references: [],
  };
}
