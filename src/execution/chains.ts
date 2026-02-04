/**
 * Layer 5: Attack Chain Generator
 * 
 * Combines multiple vulnerabilities into attack chains.
 * Real attackers chain vulnerabilities - XSS → session hijack → admin access.
 * This module identifies potential chains and generates combined exploits.
 */

import type { Gap } from "../core/scanner/types.js";

/** An attack chain combining multiple vulnerabilities */
export interface AttackChain {
  /** Chain identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Attack narrative */
  description: string;
  /** Severity of the combined attack (usually higher than individual) */
  severity: "critical" | "high" | "medium";
  /** Ordered list of gaps that form the chain */
  steps: ChainStep[];
  /** Potential impact if chain succeeds */
  impact: string;
  /** MITRE ATT&CK technique references */
  mitreTechniques?: string[];
}

/** A single step in an attack chain */
export interface ChainStep {
  /** Step number */
  order: number;
  /** The vulnerability being exploited */
  gap: Gap;
  /** What this step achieves */
  objective: string;
  /** How output feeds into next step */
  outputForNext?: string;
}

/** Known attack chain patterns */
export interface ChainPattern {
  /** Pattern name */
  name: string;
  /** Required vulnerability types in order */
  requiredTypes: string[];
  /** Optional vulnerability types that enhance the chain */
  optionalTypes: string[];
  /** Chain severity */
  severity: "critical" | "high";
  /** Description of the attack */
  description: string;
  /** Impact description */
  impact: string;
}

/**
 * Known attack chain patterns that are commonly exploited
 */
export const KNOWN_CHAIN_PATTERNS: ChainPattern[] = [
  {
    name: "XSS to Account Takeover",
    requiredTypes: ["xss"],
    optionalTypes: ["missing-authentication", "csrf"],
    severity: "critical",
    description: "Reflected or stored XSS is used to steal session cookies or JWT tokens, leading to account takeover.",
    impact: "Complete account takeover, access to user data, ability to perform actions as victim.",
  },
  {
    name: "SQL Injection to Data Exfiltration",
    requiredTypes: ["sql-injection"],
    optionalTypes: ["path-traversal", "command-injection"],
    severity: "critical",
    description: "SQL injection is used to extract sensitive data, potentially chained with file read or RCE.",
    impact: "Full database access, credential theft, potential remote code execution.",
  },
  {
    name: "SSRF to Cloud Credential Theft",
    requiredTypes: ["ssrf"],
    optionalTypes: ["path-traversal"],
    severity: "critical",
    description: "SSRF is used to access cloud metadata endpoints (169.254.169.254), stealing IAM credentials.",
    impact: "Cloud infrastructure compromise, lateral movement, data access.",
  },
  {
    name: "IDOR to Privilege Escalation",
    requiredTypes: ["idor"],
    optionalTypes: ["missing-authentication"],
    severity: "high",
    description: "IDOR allows access to admin resources by manipulating object IDs.",
    impact: "Access to other users' data, potential admin access.",
  },
  {
    name: "Open Redirect to Phishing",
    requiredTypes: ["open-redirect"],
    optionalTypes: ["xss"],
    severity: "high",
    description: "Open redirect is used to redirect victims to malicious sites from trusted domain.",
    impact: "Credential phishing, malware distribution, reputation damage.",
  },
  {
    name: "XXE to Internal Network Access",
    requiredTypes: ["xxe"],
    optionalTypes: ["ssrf", "path-traversal"],
    severity: "critical",
    description: "XXE is used to read internal files or make requests to internal services.",
    impact: "Internal network scanning, sensitive file access, SSRF-like attacks.",
  },
  {
    name: "Command Injection to Full Compromise",
    requiredTypes: ["command-injection"],
    optionalTypes: [],
    severity: "critical",
    description: "Command injection leads directly to remote code execution on the server.",
    impact: "Complete server compromise, data theft, lateral movement.",
  },
  {
    name: "Deserialization to RCE",
    requiredTypes: ["deserialization"],
    optionalTypes: ["command-injection"],
    severity: "critical",
    description: "Insecure deserialization allows arbitrary code execution via crafted objects.",
    impact: "Remote code execution, server takeover.",
  },
  {
    name: "Path Traversal to Credential Access",
    requiredTypes: ["path-traversal"],
    optionalTypes: ["hardcoded-secrets"],
    severity: "high",
    description: "Path traversal is used to read sensitive files like .env, config, or SSH keys.",
    impact: "Credential theft, configuration exposure, lateral movement.",
  },
  {
    name: "Auth Bypass to Data Breach",
    requiredTypes: ["missing-authentication", "idor"],
    optionalTypes: ["sql-injection"],
    severity: "critical",
    description: "Missing auth combined with IDOR allows access to any user's data.",
    impact: "Mass data exfiltration, privacy violation, regulatory impact.",
  },
];

/**
 * Identify potential attack chains from detected gaps
 */
export function identifyChains(gaps: Gap[]): AttackChain[] {
  const chains: AttackChain[] = [];
  const gapsByType = groupGapsByType(gaps);
  
  for (const pattern of KNOWN_CHAIN_PATTERNS) {
    // Check if we have all required types
    const hasAllRequired = pattern.requiredTypes.every(
      type => gapsByType.has(type) && gapsByType.get(type)!.length > 0
    );
    
    if (!hasAllRequired) continue;
    
    // Get matching gaps for required types
    const requiredGaps = pattern.requiredTypes.flatMap(
      type => gapsByType.get(type) ?? []
    );
    
    // Get matching gaps for optional types
    const optionalGaps = pattern.optionalTypes.flatMap(
      type => gapsByType.get(type) ?? []
    );
    
    // Build chain steps
    const steps: ChainStep[] = requiredGaps.map((gap, idx) => ({
      order: idx + 1,
      gap,
      objective: getStepObjective(gap.categoryId, idx, pattern),
      outputForNext: getOutputForNext(gap.categoryId),
    }));
    
    // Add optional steps
    for (const gap of optionalGaps.slice(0, 2)) {
      steps.push({
        order: steps.length + 1,
        gap,
        objective: `Enhance attack via ${gap.categoryId}`,
      });
    }
    
    // Create chain
    chains.push({
      id: `chain-${pattern.name.toLowerCase().replace(/ /g, "-")}-${chains.length}`,
      name: pattern.name,
      description: pattern.description,
      severity: pattern.severity,
      steps,
      impact: pattern.impact,
      mitreTechniques: getMitreTechniques(pattern.requiredTypes),
    });
  }
  
  return chains;
}

/**
 * Group gaps by their category ID
 */
function groupGapsByType(gaps: Gap[]): Map<string, Gap[]> {
  const grouped = new Map<string, Gap[]>();
  
  for (const gap of gaps) {
    const existing = grouped.get(gap.categoryId) ?? [];
    existing.push(gap);
    grouped.set(gap.categoryId, existing);
  }
  
  return grouped;
}

/**
 * Get the objective description for a chain step
 */
function getStepObjective(categoryId: string, stepIndex: number, pattern: ChainPattern): string {
  const objectives: Record<string, string[]> = {
    "xss": ["Inject malicious JavaScript", "Steal session cookies", "Execute actions as victim"],
    "sql-injection": ["Extract database credentials", "Read sensitive data", "Modify data"],
    "ssrf": ["Access internal services", "Read cloud metadata", "Scan internal network"],
    "command-injection": ["Execute arbitrary commands", "Establish persistence", "Exfiltrate data"],
    "path-traversal": ["Read sensitive files", "Access credentials", "Read source code"],
    "xxe": ["Read internal files", "Perform SSRF via DTD", "Exfiltrate data"],
    "idor": ["Access other users' resources", "Escalate privileges", "Mass data access"],
    "missing-authentication": ["Bypass authentication", "Access protected endpoints", "Gain unauthorized access"],
    "open-redirect": ["Redirect to malicious site", "Phish credentials", "Chain with XSS"],
    "deserialization": ["Execute arbitrary code", "Gain RCE", "Compromise server"],
  };
  
  const categoryObjectives = objectives[categoryId] ?? ["Exploit vulnerability"];
  return categoryObjectives[stepIndex % categoryObjectives.length] ?? categoryObjectives[0] ?? "Exploit vulnerability";
}

/**
 * Get what output this step provides to the next
 */
function getOutputForNext(categoryId: string): string {
  const outputs: Record<string, string> = {
    "xss": "Stolen session token or executed JavaScript context",
    "sql-injection": "Extracted data or modified database state",
    "ssrf": "Internal service response or cloud credentials",
    "command-injection": "Command output or shell access",
    "path-traversal": "File contents or credentials",
    "xxe": "File contents or internal response",
    "idor": "Access to unauthorized resource",
    "missing-authentication": "Unauthenticated access to protected endpoint",
    "open-redirect": "Victim redirected to attacker-controlled site",
    "deserialization": "Code execution context",
  };
  
  return outputs[categoryId] ?? "Vulnerability output";
}

/**
 * Map vulnerability types to MITRE ATT&CK techniques
 */
function getMitreTechniques(types: string[]): string[] {
  const techniques: string[] = [];
  
  for (const type of types) {
    switch (type) {
      case "sql-injection":
        techniques.push("T1190 - Exploit Public-Facing Application");
        break;
      case "xss":
        techniques.push("T1189 - Drive-by Compromise");
        techniques.push("T1539 - Steal Web Session Cookie");
        break;
      case "command-injection":
        techniques.push("T1059 - Command and Scripting Interpreter");
        techniques.push("T1190 - Exploit Public-Facing Application");
        break;
      case "ssrf":
        techniques.push("T1199 - Trusted Relationship");
        techniques.push("T1552.005 - Cloud Instance Metadata API");
        break;
      case "path-traversal":
        techniques.push("T1083 - File and Directory Discovery");
        break;
      case "deserialization":
        techniques.push("T1190 - Exploit Public-Facing Application");
        techniques.push("T1059 - Command and Scripting Interpreter");
        break;
    }
  }
  
  return [...new Set(techniques)];
}

/**
 * Generate a combined exploit test for an attack chain
 */
export function generateChainExploitTest(chain: AttackChain): string {
  const stepTests = chain.steps.map((step, idx) => `
  it('step ${step.order}: ${step.objective}', () => {
    // Exploit ${step.gap.categoryId} at ${step.gap.filePath}:${step.gap.lineStart}
    // Objective: ${step.objective}
    ${step.outputForNext ? `// Output for next step: ${step.outputForNext}` : ''}
    
    // This step would execute the ${step.gap.categoryId} exploit
    // In a real attack chain, the output feeds into the next step
    expect(true).toBe(true); // Placeholder - implement actual exploit
  });`).join("\n");

  return `
import { describe, it, expect } from 'vitest';

/**
 * Attack Chain: ${chain.name}
 * Severity: ${chain.severity.toUpperCase()}
 * 
 * ${chain.description}
 * 
 * Impact: ${chain.impact}
 * 
 * MITRE ATT&CK: ${chain.mitreTechniques?.join(", ") ?? "N/A"}
 */
describe('Attack Chain: ${chain.name}', () => {
${stepTests}

  it('full chain: achieves attack objective', () => {
    // This test validates the complete attack chain
    // Each step's output feeds into the next
    
    // Impact if successful: ${chain.impact}
    expect(true).toBe(true); // Placeholder - implement chain validation
  });
});
`.trim();
}

/**
 * Get attack chain report as markdown
 */
export function generateChainReport(chains: AttackChain[]): string {
  if (chains.length === 0) {
    return "No attack chains identified.\n";
  }
  
  let report = `## Attack Chains Identified\n\n`;
  report += `Found ${chains.length} potential attack chain(s) that combine multiple vulnerabilities.\n\n`;
  
  for (const chain of chains) {
    report += `### ${chain.name}\n\n`;
    report += `**Severity:** ${chain.severity.toUpperCase()}\n\n`;
    report += `**Description:** ${chain.description}\n\n`;
    report += `**Impact:** ${chain.impact}\n\n`;
    
    if (chain.mitreTechniques && chain.mitreTechniques.length > 0) {
      report += `**MITRE ATT&CK:** ${chain.mitreTechniques.join(", ")}\n\n`;
    }
    
    report += `**Attack Steps:**\n\n`;
    for (const step of chain.steps) {
      report += `${step.order}. **${step.gap.categoryId}** at \`${step.gap.filePath}:${step.gap.lineStart}\`\n`;
      report += `   - Objective: ${step.objective}\n`;
      if (step.outputForNext) {
        report += `   - Provides: ${step.outputForNext}\n`;
      }
    }
    report += "\n---\n\n";
  }
  
  return report;
}
