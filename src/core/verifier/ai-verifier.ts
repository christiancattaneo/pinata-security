/**
 * AI-powered verification of pattern matches.
 *
 * Instead of tuning patterns to reduce false positives, we use broad patterns
 * and let AI analyze each match to determine if it's a real vulnerability.
 */

import { Gap } from "../scanner/types.js";

export interface VerificationResult {
  isVulnerable: boolean;
  confidence: "high" | "medium" | "low";
  reasoning: string;
  mitigatingFactors: string[];
  exploitScenario: string | null;
  recommendation: string;
}

export interface AIVerifierConfig {
  provider: "anthropic" | "openai";
  model?: string;
  apiKey?: string;
}

const VERIFICATION_PROMPT = `You are a security code reviewer. Analyze this potential vulnerability and determine if it's a real issue.

CATEGORY: {{category}}
DESCRIPTION: {{description}}

CODE CONTEXT:
\`\`\`{{language}}
{{codeContext}}
\`\`\`

FLAGGED LINE(S):
\`\`\`{{language}}
{{flaggedCode}}
\`\`\`

FILE: {{filePath}}

Analyze this code and determine:
1. Is this actually vulnerable, or is it a false positive?
2. What is your confidence level (high/medium/low)?
3. What is your reasoning?
4. Are there any mitigating factors visible in the code?
5. If vulnerable, describe a concrete exploit scenario.
6. What is your recommendation?

Be rigorous. Consider:
- Is user input actually reaching this code?
- Is there sanitization, validation, or encoding nearby?
- Is this test code, example code, or production code?
- Is there context that makes this safe?

Respond in JSON format:
{
  "isVulnerable": boolean,
  "confidence": "high" | "medium" | "low",
  "reasoning": "detailed explanation",
  "mitigatingFactors": ["factor1", "factor2"],
  "exploitScenario": "how an attacker would exploit this, or null if not exploitable",
  "recommendation": "what the developer should do"
}`;

export class AIVerifier {
  private config: AIVerifierConfig;

  constructor(config: AIVerifierConfig) {
    this.config = config;
  }

  /**
   * Verify a single gap using AI analysis.
   */
  async verify(gap: Gap, fileContent: string): Promise<VerificationResult> {
    const codeContext = this.extractContext(fileContent, gap.lineStart, 20);
    const flaggedCode = this.extractContext(fileContent, gap.lineStart, 5);

    const prompt = VERIFICATION_PROMPT
      .replace("{{category}}", gap.categoryName)
      .replace("{{description}}", this.getCategoryDescription(gap.categoryId))
      .replace(/\{\{language\}\}/g, this.getLanguage(gap.filePath))
      .replace("{{codeContext}}", codeContext)
      .replace("{{flaggedCode}}", flaggedCode)
      .replace("{{filePath}}", gap.filePath);

    const response = await this.callAI(prompt);
    return this.parseResponse(response);
  }

  /**
   * Verify multiple gaps, filtering out false positives.
   */
  async verifyAll(
    gaps: Gap[],
    getFileContent: (path: string) => Promise<string>
  ): Promise<{ verified: Gap[]; dismissed: Array<{ gap: Gap; reason: string }> }> {
    const verified: Gap[] = [];
    const dismissed: Array<{ gap: Gap; reason: string }> = [];

    for (const gap of gaps) {
      try {
        const content = await getFileContent(gap.filePath);
        const result = await this.verify(gap, content);

        if (result.isVulnerable) {
          // Attach verification result to gap
          (gap as Gap & { verification: VerificationResult }).verification = result;
          verified.push(gap);
        } else {
          dismissed.push({
            gap,
            reason: result.reasoning,
          });
        }
      } catch (error) {
        // If AI fails, keep the gap (fail-safe)
        verified.push(gap);
      }
    }

    return { verified, dismissed };
  }

  private extractContext(content: string, lineNumber: number, radius: number): string {
    const lines = content.split("\n");
    const start = Math.max(0, lineNumber - radius - 1);
    const end = Math.min(lines.length, lineNumber + radius);

    return lines
      .slice(start, end)
      .map((line, i) => {
        const num = start + i + 1;
        const marker = num === lineNumber ? ">" : " ";
        return `${marker} ${num.toString().padStart(4)}| ${line}`;
      })
      .join("\n");
  }

  private getLanguage(filePath: string): string {
    if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) return "typescript";
    if (filePath.endsWith(".js") || filePath.endsWith(".jsx")) return "javascript";
    if (filePath.endsWith(".py")) return "python";
    if (filePath.endsWith(".go")) return "go";
    return "text";
  }

  private getCategoryDescription(categoryId: string): string {
    // Basic descriptions - in production, load from category store
    const descriptions: Record<string, string> = {
      "sql-injection": "SQL queries built with string concatenation allowing attackers to inject malicious SQL",
      "xss": "User input rendered in HTML without sanitization, allowing script injection",
      "command-injection": "Shell commands built with user input, allowing arbitrary command execution",
      "path-traversal": "File paths built with user input, allowing access to files outside intended directory",
      "hardcoded-secrets": "API keys, passwords, or tokens embedded in source code",
      "timing-attack": "Non-constant-time comparison of secrets, leaking information via timing",
      "memory-bloat": "Unbounded memory growth from accumulating data or inefficient patterns",
      "precision-loss": "Floating-point arithmetic for currency causing rounding errors",
      "ssrf": "Server-side requests with user-controlled URLs, allowing internal network access",
      "deserialization": "Deserializing untrusted data, potentially leading to code execution",
    };
    return descriptions[categoryId] ?? "Potential security or reliability issue";
  }

  private async callAI(prompt: string): Promise<string> {
    const apiKey = this.config.apiKey ?? this.getApiKeyFromEnv();

    if (!apiKey) {
      throw new Error(`No API key configured for ${this.config.provider}`);
    }

    if (this.config.provider === "anthropic") {
      return this.callAnthropic(prompt, apiKey);
    } else {
      return this.callOpenAI(prompt, apiKey);
    }
  }

  private async callAnthropic(prompt: string, apiKey: string): Promise<string> {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.config.model ?? "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    return data.content[0]?.text ?? "";
  }

  private async callOpenAI(prompt: string, apiKey: string): Promise<string> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model ?? "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0]?.message?.content ?? "";
  }

  private getApiKeyFromEnv(): string {
    if (this.config.provider === "anthropic") {
      return process.env["ANTHROPIC_API_KEY"] ?? "";
    }
    return process.env["OPENAI_API_KEY"] ?? "";
  }

  private parseResponse(response: string): VerificationResult {
    try {
      // Extract JSON from response (may have markdown wrapping)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const parsed = JSON.parse(jsonMatch[0]) as VerificationResult;

      return {
        isVulnerable: Boolean(parsed.isVulnerable),
        confidence: parsed.confidence ?? "medium",
        reasoning: parsed.reasoning ?? "No reasoning provided",
        mitigatingFactors: parsed.mitigatingFactors ?? [],
        exploitScenario: parsed.exploitScenario ?? null,
        recommendation: parsed.recommendation ?? "Review this code manually",
      };
    } catch {
      // If parsing fails, assume vulnerable (fail-safe)
      return {
        isVulnerable: true,
        confidence: "low",
        reasoning: "AI analysis failed to parse, flagging for manual review",
        mitigatingFactors: [],
        exploitScenario: null,
        recommendation: "Manual review required",
      };
    }
  }
}
