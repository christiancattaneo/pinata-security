/**
 * Tests for the attack chain detection and generation
 */

import { describe, it, expect } from "vitest";
import {
  KNOWN_CHAIN_PATTERNS,
  identifyChains,
  generateChainExploitTest,
  generateChainReport,
  type AttackChain,
} from "../../src/execution/chains.js";
import type { Gap } from "../../src/core/scanner/types.js";

// Helper to create test gaps
function createGap(categoryId: string, filePath: string, lineStart: number): Gap {
  return {
    id: `gap-${categoryId}-${lineStart}`,
    categoryId,
    category: categoryId,
    description: `Test ${categoryId} gap`,
    severity: "high",
    confidence: "high",
    filePath,
    lineStart,
    lineEnd: lineStart + 5,
    code: "test code",
    codeSnippet: "test code snippet",
    matchedPattern: "test-pattern",
    remediation: "Fix the issue",
  };
}

describe("Known Chain Patterns", () => {
  it("has multiple attack chain patterns", () => {
    expect(KNOWN_CHAIN_PATTERNS.length).toBeGreaterThan(5);
  });

  it("each pattern has required fields", () => {
    for (const pattern of KNOWN_CHAIN_PATTERNS) {
      expect(pattern.name).toBeTruthy();
      expect(pattern.requiredTypes.length).toBeGreaterThan(0);
      expect(pattern.severity).toMatch(/^(critical|high)$/);
      expect(pattern.description).toBeTruthy();
      expect(pattern.impact).toBeTruthy();
    }
  });

  it("includes XSS to Account Takeover chain", () => {
    const chain = KNOWN_CHAIN_PATTERNS.find(p => p.name === "XSS to Account Takeover");
    expect(chain).toBeDefined();
    expect(chain?.requiredTypes).toContain("xss");
  });

  it("includes SSRF to Cloud Credential Theft chain", () => {
    const chain = KNOWN_CHAIN_PATTERNS.find(p => p.name === "SSRF to Cloud Credential Theft");
    expect(chain).toBeDefined();
    expect(chain?.requiredTypes).toContain("ssrf");
  });

  it("includes SQL Injection to Data Exfiltration chain", () => {
    const chain = KNOWN_CHAIN_PATTERNS.find(p => p.name === "SQL Injection to Data Exfiltration");
    expect(chain).toBeDefined();
    expect(chain?.requiredTypes).toContain("sql-injection");
  });
});

describe("Chain Identification", () => {
  it("identifies XSS chain when XSS gap exists", () => {
    const gaps = [
      createGap("xss", "app/views/search.tsx", 42),
    ];

    const chains = identifyChains(gaps);
    
    expect(chains.length).toBeGreaterThan(0);
    expect(chains.some(c => c.name === "XSS to Account Takeover")).toBe(true);
  });

  it("identifies SQL injection chain", () => {
    const gaps = [
      createGap("sql-injection", "api/users.ts", 15),
    ];

    const chains = identifyChains(gaps);
    
    expect(chains.some(c => c.name === "SQL Injection to Data Exfiltration")).toBe(true);
  });

  it("identifies SSRF chain", () => {
    const gaps = [
      createGap("ssrf", "api/fetch.ts", 23),
    ];

    const chains = identifyChains(gaps);
    
    expect(chains.some(c => c.name === "SSRF to Cloud Credential Theft")).toBe(true);
  });

  it("includes optional types in chain steps", () => {
    const gaps = [
      createGap("sql-injection", "api/users.ts", 15),
      createGap("path-traversal", "api/files.ts", 30),
    ];

    const chains = identifyChains(gaps);
    const sqlChain = chains.find(c => c.name === "SQL Injection to Data Exfiltration");
    
    expect(sqlChain).toBeDefined();
    expect(sqlChain?.steps.length).toBeGreaterThanOrEqual(2);
  });

  it("returns empty array when no patterns match", () => {
    const gaps = [
      createGap("missing-timeout", "api/slow.ts", 10),
    ];

    const chains = identifyChains(gaps);
    
    expect(chains.length).toBe(0);
  });

  it("identifies multiple chains from multiple gaps", () => {
    const gaps = [
      createGap("xss", "app/search.tsx", 42),
      createGap("sql-injection", "api/users.ts", 15),
      createGap("ssrf", "api/proxy.ts", 23),
    ];

    const chains = identifyChains(gaps);
    
    expect(chains.length).toBeGreaterThanOrEqual(3);
  });
});

describe("Chain Structure", () => {
  it("chains have valid structure", () => {
    const gaps = [
      createGap("xss", "app/views/search.tsx", 42),
    ];

    const chains = identifyChains(gaps);
    
    for (const chain of chains) {
      expect(chain.id).toBeTruthy();
      expect(chain.name).toBeTruthy();
      expect(chain.description).toBeTruthy();
      expect(chain.severity).toMatch(/^(critical|high|medium)$/);
      expect(chain.steps.length).toBeGreaterThan(0);
      expect(chain.impact).toBeTruthy();
    }
  });

  it("steps have valid structure", () => {
    const gaps = [
      createGap("sql-injection", "api/users.ts", 15),
    ];

    const chains = identifyChains(gaps);
    const chain = chains[0];

    if (chain) {
      for (const step of chain.steps) {
        expect(step.order).toBeGreaterThan(0);
        expect(step.gap).toBeDefined();
        expect(step.objective).toBeTruthy();
      }
    }
  });

  it("includes MITRE ATT&CK techniques", () => {
    const gaps = [
      createGap("sql-injection", "api/users.ts", 15),
    ];

    const chains = identifyChains(gaps);
    const chain = chains.find(c => c.name === "SQL Injection to Data Exfiltration");

    expect(chain?.mitreTechniques).toBeDefined();
    expect(chain?.mitreTechniques?.length).toBeGreaterThan(0);
  });
});

describe("Chain Exploit Test Generation", () => {
  it("generates valid test code", () => {
    const chain: AttackChain = {
      id: "test-chain",
      name: "Test Chain",
      description: "A test attack chain",
      severity: "high",
      steps: [
        {
          order: 1,
          gap: createGap("xss", "app/test.tsx", 10),
          objective: "Inject script",
          outputForNext: "Stolen cookie",
        },
      ],
      impact: "Account takeover",
      mitreTechniques: ["T1189"],
    };

    const testCode = generateChainExploitTest(chain);

    expect(testCode).toContain("describe('Attack Chain: Test Chain'");
    expect(testCode).toContain("step 1: Inject script");
    expect(testCode).toContain("Impact: Account takeover");
    expect(testCode).toContain("MITRE ATT&CK: T1189");
  });

  it("includes all steps in test", () => {
    const chain: AttackChain = {
      id: "multi-step-chain",
      name: "Multi-Step Chain",
      description: "Chain with multiple steps",
      severity: "critical",
      steps: [
        {
          order: 1,
          gap: createGap("xss", "app/test.tsx", 10),
          objective: "Step one",
        },
        {
          order: 2,
          gap: createGap("csrf", "app/test.tsx", 20),
          objective: "Step two",
        },
        {
          order: 3,
          gap: createGap("idor", "app/test.tsx", 30),
          objective: "Step three",
        },
      ],
      impact: "Full compromise",
    };

    const testCode = generateChainExploitTest(chain);

    expect(testCode).toContain("step 1: Step one");
    expect(testCode).toContain("step 2: Step two");
    expect(testCode).toContain("step 3: Step three");
  });
});

describe("Chain Report Generation", () => {
  it("generates markdown report", () => {
    const gaps = [
      createGap("xss", "app/search.tsx", 42),
      createGap("sql-injection", "api/users.ts", 15),
    ];

    const chains = identifyChains(gaps);
    const report = generateChainReport(chains);

    expect(report).toContain("## Attack Chains Identified");
    expect(report).toContain("**Severity:**");
    expect(report).toContain("**Attack Steps:**");
  });

  it("handles empty chains gracefully", () => {
    const report = generateChainReport([]);

    expect(report).toContain("No attack chains identified");
  });

  it("includes file locations in report", () => {
    const gaps = [
      createGap("xss", "app/views/vulnerable.tsx", 42),
    ];

    const chains = identifyChains(gaps);
    const report = generateChainReport(chains);

    expect(report).toContain("app/views/vulnerable.tsx:42");
  });
});
