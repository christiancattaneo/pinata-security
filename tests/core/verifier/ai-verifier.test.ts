import { describe, it, expect } from "vitest";

describe("AIVerifier", () => {
  it("should export AIVerifier class", async () => {
    const module = await import("../../../src/core/verifier/ai-verifier.js");
    expect(module.AIVerifier).toBeDefined();
    expect(typeof module.AIVerifier).toBe("function");
  });

  it("should create AIVerifier instance", async () => {
    const { AIVerifier } = await import("../../../src/core/verifier/ai-verifier.js");
    const config = { 
      provider: "anthropic" as const,
      apiKey: "test-key",
      batchSize: 5,
      concurrency: 2
    };
    
    const verifier = new AIVerifier(config);
    expect(verifier).toBeDefined();
    expect(verifier).toBeInstanceOf(AIVerifier);
  });

  it("should have required methods", async () => {
    const { AIVerifier } = await import("../../../src/core/verifier/ai-verifier.js");
    const config = { 
      provider: "anthropic" as const,
      apiKey: "test-key",
      batchSize: 5,
      concurrency: 2
    };
    
    const verifier = new AIVerifier(config);
    
    // Check that the verifier has the expected methods
    expect(typeof verifier.verifyAll).toBe("function");
  });
});