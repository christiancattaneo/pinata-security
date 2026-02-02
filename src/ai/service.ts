/**
 * AI Service Implementation
 *
 * Provides a unified interface for AI completions across providers.
 * Supports Anthropic Claude and OpenAI GPT models.
 */

import type {
  AIConfig,
  AIProvider,
  AIResponse,
  CompletionRequest,
} from "./types.js";

const DEFAULT_CONFIG: Required<AIConfig> = {
  provider: "anthropic",
  apiKey: "",
  model: "claude-sonnet-4-20250514",
  maxTokens: 1024,
  temperature: 0.3,
  timeoutMs: 30000,
};

const PROVIDER_MODELS: Record<AIProvider, string> = {
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4o",
  mock: "mock-model",
};

const PROVIDER_ENDPOINTS: Record<AIProvider, string> = {
  anthropic: "https://api.anthropic.com/v1/messages",
  openai: "https://api.openai.com/v1/chat/completions",
  mock: "",
};

/**
 * AI Service for generating completions
 */
export class AIService {
  private readonly config: Required<AIConfig>;

  constructor(config: Partial<AIConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      apiKey: config.apiKey ?? this.getApiKeyFromEnv(config.provider ?? "anthropic"),
      model: config.model ?? PROVIDER_MODELS[config.provider ?? "anthropic"],
    };
  }

  /**
   * Get API key from environment variable
   */
  private getApiKeyFromEnv(provider: AIProvider): string {
    if (provider === "mock") return "mock-key";

    const envVar = provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
    return process.env[envVar] ?? "";
  }

  /**
   * Check if the service is configured with an API key
   */
  isConfigured(): boolean {
    return this.config.provider === "mock" || this.config.apiKey.length > 0;
  }

  /**
   * Get the current provider
   */
  getProvider(): AIProvider {
    return this.config.provider;
  }

  /**
   * Generate a completion
   */
  async complete(request: CompletionRequest): Promise<AIResponse<string>> {
    const startTime = Date.now();

    if (!this.isConfigured()) {
      return {
        success: false,
        error: `API key not configured for ${this.config.provider}. Set ${this.config.provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"} environment variable.`,
        durationMs: Date.now() - startTime,
      };
    }

    if (this.config.provider === "mock") {
      return this.mockComplete(request, startTime);
    }

    try {
      const response = await this.callProvider(request);
      return {
        success: true,
        data: response.content,
        usage: response.usage,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Generate a JSON completion (parses response as JSON)
   */
  async completeJSON<T>(request: CompletionRequest): Promise<AIResponse<T>> {
    const response = await this.complete({
      ...request,
      messages: [
        ...request.messages,
        {
          role: "user",
          content: "\n\nRespond with valid JSON only. No markdown, no explanation.",
        },
      ],
    });

    if (!response.success || response.data === undefined) {
      return {
        success: false,
        error: response.error ?? "No response data",
        durationMs: response.durationMs,
      };
    }

    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = response.data;
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1] ?? jsonStr;
      }

      // Try to find JSON object or array
      const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
      const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
      jsonStr = objectMatch?.[0] ?? arrayMatch?.[0] ?? jsonStr;

      const parsed = JSON.parse(jsonStr.trim()) as T;
      const result: AIResponse<T> = {
        success: true,
        data: parsed,
        durationMs: response.durationMs,
      };
      if (response.usage) {
        result.usage = response.usage;
      }
      return result;
    } catch (error) {
      return {
        success: false,
        error: `Failed to parse JSON response: ${error instanceof Error ? error.message : "Unknown error"}`,
        durationMs: response.durationMs,
      };
    }
  }

  /**
   * Call the AI provider API
   */
  private async callProvider(request: CompletionRequest): Promise<{
    content: string;
    usage: { inputTokens: number; outputTokens: number };
  }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      if (this.config.provider === "anthropic") {
        return await this.callAnthropic(request, controller.signal);
      } else {
        return await this.callOpenAI(request, controller.signal);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Call Anthropic API
   */
  private async callAnthropic(
    request: CompletionRequest,
    signal: AbortSignal
  ): Promise<{ content: string; usage: { inputTokens: number; outputTokens: number } }> {
    const messages = request.messages.filter((m) => m.role !== "system");

    const response = await fetch(PROVIDER_ENDPOINTS.anthropic, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: request.maxTokens ?? this.config.maxTokens,
        temperature: request.temperature ?? this.config.temperature,
        system: request.systemPrompt,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
      signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as {
      content: Array<{ text: string }>;
      usage: { input_tokens: number; output_tokens: number };
    };

    return {
      content: data.content[0]?.text ?? "",
      usage: {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
      },
    };
  }

  /**
   * Call OpenAI API
   */
  private async callOpenAI(
    request: CompletionRequest,
    signal: AbortSignal
  ): Promise<{ content: string; usage: { inputTokens: number; outputTokens: number } }> {
    const messages: Array<{ role: string; content: string }> = [];

    if (request.systemPrompt !== undefined && request.systemPrompt.length > 0) {
      messages.push({ role: "system", content: request.systemPrompt });
    }

    for (const m of request.messages) {
      messages.push({ role: m.role, content: m.content });
    }

    const response = await fetch(PROVIDER_ENDPOINTS.openai, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: request.maxTokens ?? this.config.maxTokens,
        temperature: request.temperature ?? this.config.temperature,
        messages,
      }),
      signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage: { prompt_tokens: number; completion_tokens: number };
    };

    return {
      content: data.choices[0]?.message.content ?? "",
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
      },
    };
  }

  /**
   * Mock completion for testing
   */
  private mockComplete(request: CompletionRequest, startTime: number): AIResponse<string> {
    const lastMessage = request.messages[request.messages.length - 1];
    const content = lastMessage?.content ?? "";

    // Generate mock responses based on content
    let response = "Mock AI response";

    if (content.includes("explain") || content.includes("explanation")) {
      response = JSON.stringify({
        summary: "This code pattern may introduce a security vulnerability.",
        explanation: "The detected pattern suggests potential security risk.",
        risk: "An attacker could exploit this vulnerability to compromise the system.",
        remediation: "Use parameterized queries or proper input validation.",
        safeExample: "cursor.execute('SELECT * FROM users WHERE id = ?', (user_id,))",
      });
    } else if (content.includes("variable") || content.includes("template")) {
      response = JSON.stringify({
        suggestions: [
          {
            name: "className",
            value: "UserService",
            reasoning: "Based on the file name and context",
            confidence: 0.8,
          },
          {
            name: "functionName",
            value: "get_user",
            reasoning: "Extracted from the code snippet",
            confidence: 0.9,
          },
        ],
      });
    } else if (content.includes("pattern") || content.includes("regex")) {
      response = JSON.stringify({
        suggestions: [
          {
            id: "custom-sql-pattern",
            pattern: "execute\\s*\\(.*\\+",
            description: "Detects SQL execution with string concatenation",
            confidence: "medium",
            matchExample: "cursor.execute(query + user_input)",
            safeExample: "cursor.execute(query, (user_input,))",
            reasoning: "String concatenation in SQL queries is a common injection vector",
          },
        ],
      });
    }

    return {
      success: true,
      data: response,
      usage: { inputTokens: 100, outputTokens: 50 },
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Create an AI service instance
 */
export function createAIService(config?: Partial<AIConfig>): AIService {
  return new AIService(config);
}
