/**
 * AI-powered verification of pattern matches.
 *
 * Optimized for efficiency:
 * 1. Smart pre-filtering to skip obvious false positives
 * 2. Batch prompts (10 gaps per API call)
 * 3. Parallel execution (3 concurrent batches)
 *
 * 352 gaps → ~50 after filtering → 5 batches × 3 parallel = ~20 seconds
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

export interface BatchVerificationResult {
  id: string;
  isVulnerable: boolean;
  confidence: "high" | "medium" | "low";
  reasoning: string;
}

export interface AIVerifierConfig {
  provider: "anthropic" | "openai";
  model?: string;
  apiKey?: string;
  batchSize?: number; // Gaps per API call (default: 10)
  concurrency?: number; // Parallel batches (default: 3)
}

// Patterns that indicate safe/test code - skip AI verification
const SKIP_PATTERNS = {
  paths: [
    /\.test\.(ts|js|tsx|jsx)$/,
    /\.spec\.(ts|js|tsx|jsx)$/,
    /tests?\//i,
    /fixtures?\//i,
    /mocks?\//i,
    /__tests__\//,
    /node_modules\//,
    /dist\//,
    /\.d\.ts$/,
    /examples?\//i,
  ],
  // Content patterns that indicate false positive
  content: [
    /\/\/ SAFE:/i, // Explicit safe marker
    /\/\/ nosec/i, // Security ignore
    /eslint-disable/i,
    /sanitized?|escaped?|validated?/i, // Near sanitization
  ],
};

// Batch verification prompt - handles multiple gaps at once
const BATCH_PROMPT = `You are a security code reviewer. Analyze these potential vulnerabilities and determine which are real issues vs false positives.

For each item, consider:
- Is user input actually reaching this code?
- Is there sanitization, validation, or encoding nearby?
- Is this test code, example code, or production code?
- Is there context that makes this safe?

Be rigorous. Most pattern matches are false positives.

ITEMS TO ANALYZE:
{{items}}

Respond with a JSON array. Each object MUST have these exact fields:
[
  {
    "id": "1",
    "isVulnerable": true/false,
    "confidence": "high"/"medium"/"low",
    "reasoning": "brief explanation"
  },
  ...
]

Only return the JSON array, no other text.`;

const SINGLE_ITEM_TEMPLATE = `
---
ID: {{id}}
CATEGORY: {{category}}
FILE: {{filePath}}:{{lineNumber}}
CODE:
\`\`\`{{language}}
{{codeContext}}
\`\`\`
FLAGGED LINE: {{flaggedLine}}
---`;

export class AIVerifier {
  private config: AIVerifierConfig;
  private readonly batchSize: number;
  private readonly concurrency: number;

  constructor(config: AIVerifierConfig) {
    this.config = config;
    this.batchSize = config.batchSize ?? 10;
    this.concurrency = config.concurrency ?? 3;
  }

  /**
   * Verify multiple gaps efficiently using filtering, batching, and parallelism.
   *
   * Flow:
   * 1. Pre-filter obvious false positives (test files, etc.)
   * 2. Group remaining gaps into batches of 10
   * 3. Process 3 batches in parallel
   * 4. Return verified gaps and dismissed with reasons
   */
  async verifyAll(
    gaps: Gap[],
    getFileContent: (path: string) => Promise<string>
  ): Promise<{
    verified: Gap[];
    dismissed: Array<{ gap: Gap; reason: string }>;
    stats: { total: number; preFiltered: number; aiDismissed: number; aiVerified: number };
  }> {
    const verified: Gap[] = [];
    const dismissed: Array<{ gap: Gap; reason: string }> = [];

    // Step 1: Pre-filter obvious false positives
    const { toVerify, preFiltered } = this.preFilter(gaps);
    dismissed.push(...preFiltered);

    if (toVerify.length === 0) {
      return {
        verified: [],
        dismissed,
        stats: {
          total: gaps.length,
          preFiltered: preFiltered.length,
          aiDismissed: 0,
          aiVerified: 0,
        },
      };
    }

    console.log(`Pre-filtered ${preFiltered.length} gaps. Verifying ${toVerify.length} with AI...`);

    // Step 2: Load file contents (deduplicated)
    const fileContents = new Map<string, string>();
    const uniquePaths = [...new Set(toVerify.map((g) => g.filePath))];
    await Promise.all(
      uniquePaths.map(async (path) => {
        try {
          fileContents.set(path, await getFileContent(path));
        } catch {
          fileContents.set(path, "");
        }
      })
    );

    // Step 3: Create batches
    const batches = this.createBatches(toVerify, fileContents);
    console.log(`Created ${batches.length} batches of ~${this.batchSize} gaps each`);

    // Step 4: Process batches in parallel (limited concurrency)
    const results = await this.processParallel(batches, toVerify);

    // Step 5: Separate verified from dismissed
    let aiVerified = 0;
    let aiDismissed = 0;

    for (const gap of toVerify) {
      const gapId = `${gap.filePath}:${gap.lineStart}`;
      const result = results.get(gapId);

      if (!result || result.isVulnerable) {
        // No result (AI failure) or confirmed vulnerable
        verified.push(gap);
        aiVerified++;
      } else {
        // AI dismissed as false positive
        dismissed.push({
          gap,
          reason: result.reasoning,
        });
        aiDismissed++;
      }
    }

    return {
      verified,
      dismissed,
      stats: {
        total: gaps.length,
        preFiltered: preFiltered.length,
        aiDismissed,
        aiVerified,
      },
    };
  }

  /**
   * Pre-filter gaps that are obviously false positives without needing AI.
   */
  private preFilter(
    gaps: Gap[]
  ): { toVerify: Gap[]; preFiltered: Array<{ gap: Gap; reason: string }> } {
    const toVerify: Gap[] = [];
    const preFiltered: Array<{ gap: Gap; reason: string }> = [];

    for (const gap of gaps) {
      // Check path patterns
      const pathMatch = SKIP_PATTERNS.paths.find((p) => p.test(gap.filePath));
      if (pathMatch) {
        preFiltered.push({
          gap,
          reason: `Skipped: test/example file (${pathMatch.source})`,
        });
        continue;
      }

      // Check if it's a type definition or interface
      if (gap.categoryId === "precision-loss" && gap.filePath.endsWith(".ts")) {
        // TypeScript type annotations are not runtime vulnerabilities
        preFiltered.push({
          gap,
          reason: "TypeScript type annotation, not runtime code",
        });
        continue;
      }

      toVerify.push(gap);
    }

    return { toVerify, preFiltered };
  }

  /**
   * Create batches of gaps for batch API calls.
   */
  private createBatches(
    gaps: Gap[],
    fileContents: Map<string, string>
  ): Array<{ prompt: string; gapIds: string[] }> {
    const batches: Array<{ prompt: string; gapIds: string[] }> = [];

    for (let i = 0; i < gaps.length; i += this.batchSize) {
      const batchGaps = gaps.slice(i, i + this.batchSize);
      const items: string[] = [];
      const gapIds: string[] = [];

      for (let j = 0; j < batchGaps.length; j++) {
        const gap = batchGaps[j]!;
        const content = fileContents.get(gap.filePath) ?? "";
        const gapId = `${gap.filePath}:${gap.lineStart}`;
        gapIds.push(gapId);

        const codeContext = this.extractContext(content, gap.lineStart, 10);
        const flaggedLine = this.extractLine(content, gap.lineStart);

        items.push(
          SINGLE_ITEM_TEMPLATE
            .replace("{{id}}", String(j + 1))
            .replace("{{category}}", gap.categoryName)
            .replace("{{filePath}}", gap.filePath)
            .replace("{{lineNumber}}", String(gap.lineStart))
            .replace("{{language}}", this.getLanguage(gap.filePath))
            .replace("{{codeContext}}", codeContext)
            .replace("{{flaggedLine}}", flaggedLine)
        );
      }

      const prompt = BATCH_PROMPT.replace("{{items}}", items.join("\n"));
      batches.push({ prompt, gapIds });
    }

    return batches;
  }

  /**
   * Process batches in parallel with limited concurrency.
   */
  private async processParallel(
    batches: Array<{ prompt: string; gapIds: string[] }>,
    gaps: Gap[]
  ): Promise<Map<string, BatchVerificationResult>> {
    const results = new Map<string, BatchVerificationResult>();
    let completed = 0;

    // Process in waves of `concurrency` batches
    for (let i = 0; i < batches.length; i += this.concurrency) {
      const wave = batches.slice(i, i + this.concurrency);

      const waveResults = await Promise.all(
        wave.map(async (batch) => {
          try {
            const response = await this.callAI(batch.prompt);
            return { gapIds: batch.gapIds, response };
          } catch (error) {
            console.error(`Batch failed: ${error instanceof Error ? error.message : String(error)}`);
            return { gapIds: batch.gapIds, response: null };
          }
        })
      );

      // Parse results
      for (const { gapIds, response } of waveResults) {
        if (response) {
          const parsed = this.parseBatchResponse(response);
          for (let j = 0; j < gapIds.length && j < parsed.length; j++) {
            const gapId = gapIds[j]!;
            const result = parsed[j];
            if (result) {
              results.set(gapId, result);
            }
          }
        }
      }

      completed += wave.length;
      console.log(`Processed ${completed}/${batches.length} batches...`);
    }

    return results;
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
        return `${marker}${num.toString().padStart(4)}| ${line}`;
      })
      .join("\n");
  }

  private extractLine(content: string, lineNumber: number): string {
    const lines = content.split("\n");
    return lines[lineNumber - 1] ?? "";
  }

  private getLanguage(filePath: string): string {
    if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) return "typescript";
    if (filePath.endsWith(".js") || filePath.endsWith(".jsx")) return "javascript";
    if (filePath.endsWith(".py")) return "python";
    if (filePath.endsWith(".go")) return "go";
    return "text";
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60s for batches

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.config.model ?? "claude-sonnet-4-20250514",
          max_tokens: 4096, // Larger for batch responses
          messages: [{ role: "user", content: prompt }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${body}`);
      }

      const data = (await response.json()) as {
        content: Array<{ type: string; text: string }>;
      };
      return data.content[0]?.text ?? "";
    } finally {
      clearTimeout(timeout);
    }
  }

  private async callOpenAI(prompt: string, apiKey: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60s for batches

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model ?? "gpt-4o",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 4096,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${body}`);
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      return data.choices[0]?.message?.content ?? "";
    } finally {
      clearTimeout(timeout);
    }
  }

  private getApiKeyFromEnv(): string {
    if (this.config.provider === "anthropic") {
      return process.env["ANTHROPIC_API_KEY"] ?? "";
    }
    return process.env["OPENAI_API_KEY"] ?? "";
  }

  private parseBatchResponse(response: string): BatchVerificationResult[] {
    try {
      // Extract JSON array from response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.error("No JSON array found in batch response");
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]) as BatchVerificationResult[];

      return parsed.map((item) => ({
        id: String(item.id),
        isVulnerable: Boolean(item.isVulnerable),
        confidence: item.confidence ?? "medium",
        reasoning: item.reasoning ?? "No reasoning provided",
      }));
    } catch (error) {
      console.error(`Failed to parse batch response: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * Legacy single-gap verification (kept for backwards compatibility).
   */
  async verify(gap: Gap, fileContent: string): Promise<VerificationResult> {
    const result = await this.verifyAll([gap], async () => fileContent);
    if (result.verified.length > 0) {
      return {
        isVulnerable: true,
        confidence: "high",
        reasoning: "AI confirmed vulnerability",
        mitigatingFactors: [],
        exploitScenario: null,
        recommendation: "Fix this issue",
      };
    }
    const dismissal = result.dismissed[0];
    return {
      isVulnerable: false,
      confidence: "high",
      reasoning: dismissal?.reason ?? "AI dismissed as false positive",
      mitigatingFactors: [],
      exploitScenario: null,
      recommendation: "No action needed",
    };
  }
}
