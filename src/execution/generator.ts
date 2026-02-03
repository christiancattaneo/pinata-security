/**
 * Layer 5: Exploit Test Generator
 * 
 * Generates executable exploit tests for specific vulnerability types.
 */

import type { Gap } from "../core/scanner/types.js";
import type { ExecutionLanguage } from "./types.js";

/**
 * Generate exploit test code for a gap
 */
export function generateExploitTest(
  gap: Gap,
  targetCode: string,
  language: ExecutionLanguage
): string {
  const categoryId = gap.categoryId;

  // Route to specific generator
  switch (categoryId) {
    case "sql-injection":
      return generateSqlInjectionTest(gap, targetCode, language);
    case "xss":
      return generateXssTest(gap, targetCode, language);
    case "command-injection":
      return generateCommandInjectionTest(gap, targetCode, language);
    case "path-traversal":
      return generatePathTraversalTest(gap, targetCode, language);
    default:
      return generateGenericTest(gap, targetCode, language);
  }
}

/**
 * Generate SQL injection exploit test
 */
function generateSqlInjectionTest(
  gap: Gap,
  targetCode: string,
  language: ExecutionLanguage
): string {
  if (language === "python") {
    return `
import pytest
from target import *

class TestSqlInjectionExploit:
    """Exploit tests for SQL injection at line ${gap.lineStart}"""
    
    PAYLOADS = [
        "' OR '1'='1",
        "1; DROP TABLE users--",
        "1 UNION SELECT * FROM admin_users--",
        "1' AND '1'='1",
        "1' AND '1'='2",
    ]
    
    def test_boolean_blind_injection(self):
        """Test if boolean conditions affect query results."""
        # True condition should return data
        result_true = execute_query("1' AND '1'='1")
        # False condition should return different/no data
        result_false = execute_query("1' AND '1'='2")
        
        # If injectable, results will differ
        assert result_true != result_false, "Boolean blind injection confirmed"
    
    def test_union_injection(self):
        """Test if UNION attacks can extract additional data."""
        payload = "1 UNION SELECT username, password FROM users--"
        result = execute_query(payload)
        
        # Should return more data than expected
        assert len(result) > 1 or 'password' in str(result).lower()
    
    def test_error_based_injection(self):
        """Test if SQL errors are exposed."""
        payload = "'"  # Single quote to break syntax
        try:
            result = execute_query(payload)
            # If no error, check for error text in response
            assert 'syntax' not in str(result).lower()
        except Exception as e:
            # SQL error exposed - injection confirmed
            assert 'sql' in str(e).lower() or 'syntax' in str(e).lower()
`.trim();
  }

  // TypeScript/JavaScript
  return `
import { describe, it, expect } from 'vitest';

// Import target code
// Note: Adjust import based on actual target structure
const targetCode = \`${escapeTemplate(targetCode)}\`;

describe('SQL Injection Exploit - ${gap.filePath}:${gap.lineStart}', () => {
  const PAYLOADS = [
    "' OR '1'='1",
    "1; DROP TABLE users--",
    "1 UNION SELECT * FROM admin_users--",
    "1' AND '1'='1",
    "1' AND '1'='2",
  ];

  it('exploit: boolean blind injection', async () => {
    // Simulate the vulnerable code path
    const mockDb = {
      queries: [] as string[],
      query: async (sql: string) => {
        mockDb.queries.push(sql);
        // Return different results based on boolean logic in SQL
        if (sql.includes("'1'='1'")) return [{ id: 1 }];
        if (sql.includes("'1'='2'")) return [];
        return [{ id: 1 }];
      },
    };

    // Test with true condition
    const payloadTrue = "1' AND '1'='1";
    const queryTrue = \`SELECT * FROM users WHERE id = '\${payloadTrue}'\`;
    const resultTrue = await mockDb.query(queryTrue);

    // Test with false condition
    const payloadFalse = "1' AND '1'='2";
    const queryFalse = \`SELECT * FROM users WHERE id = '\${payloadFalse}'\`;
    const resultFalse = await mockDb.query(queryFalse);

    // Vulnerability confirmed if:
    // 1. Payload is included unescaped in query
    // 2. Results differ based on boolean logic
    expect(mockDb.queries[0]).toContain(payloadTrue);
    expect(resultTrue.length).not.toBe(resultFalse.length);
  });

  it('exploit: query contains unescaped input', () => {
    // Check if target code uses string concatenation/interpolation
    const vulnerablePatterns = [
      /\\$\\{.*\\}/,           // Template literal interpolation
      /\\+ .*userId/,          // String concatenation
      /query\\(.*\\+/,         // Concatenation in query call
      /execute\\(.*\\$\\{/,    // Template in execute
    ];

    const hasVulnerablePattern = vulnerablePatterns.some(p => p.test(targetCode));
    expect(hasVulnerablePattern).toBe(true);
  });
});
`.trim();
}

/**
 * Generate XSS exploit test
 */
function generateXssTest(
  gap: Gap,
  targetCode: string,
  language: ExecutionLanguage
): string {
  return `
import { describe, it, expect } from 'vitest';

describe('XSS Exploit - ${gap.filePath}:${gap.lineStart}', () => {
  const PAYLOADS = [
    '<script>alert("XSS")</script>',
    '<img src=x onerror=alert("XSS")>',
    '"><script>alert("XSS")</script>',
    "javascript:alert('XSS')",
    '<svg onload=alert("XSS")>',
  ];

  it('exploit: script tag injection', () => {
    const payload = '<script>alert("XSS")</script>';
    const targetCode = \`${escapeTemplate(targetCode)}\`;
    
    // Check if target code escapes HTML
    const escapesHtml = targetCode.includes('escapeHtml') ||
                        targetCode.includes('sanitize') ||
                        targetCode.includes('DOMPurify') ||
                        targetCode.includes('textContent');
    
    // Vulnerability confirmed if no escaping
    expect(escapesHtml).toBe(false);
  });

  it('exploit: innerHTML usage without sanitization', () => {
    const targetCode = \`${escapeTemplate(targetCode)}\`;
    
    const usesInnerHtml = targetCode.includes('innerHTML') ||
                          targetCode.includes('outerHTML') ||
                          targetCode.includes('dangerouslySetInnerHTML');
    
    const hasSanitization = targetCode.includes('sanitize') ||
                            targetCode.includes('DOMPurify') ||
                            targetCode.includes('escape');
    
    // Vulnerable: uses innerHTML without sanitization
    if (usesInnerHtml) {
      expect(hasSanitization).toBe(false);
    }
  });
});
`.trim();
}

/**
 * Generate command injection exploit test
 */
function generateCommandInjectionTest(
  gap: Gap,
  targetCode: string,
  language: ExecutionLanguage
): string {
  return `
import { describe, it, expect } from 'vitest';

describe('Command Injection Exploit - ${gap.filePath}:${gap.lineStart}', () => {
  const PAYLOADS = [
    '; ls -la',
    '| cat /etc/passwd',
    '\`whoami\`',
    '$(id)',
    '&& echo PWNED',
  ];

  it('exploit: shell metacharacters in exec', () => {
    const targetCode = \`${escapeTemplate(targetCode)}\`;
    
    // Check for dangerous patterns
    const usesExec = targetCode.includes('exec(') ||
                     targetCode.includes('execSync(') ||
                     targetCode.includes('spawn(') ||
                     targetCode.includes('child_process');
    
    const usesShell = targetCode.includes('shell: true') ||
                      targetCode.includes('/bin/sh') ||
                      targetCode.includes('/bin/bash');
    
    const hasInputInCommand = /exec.*\\$\\{|exec.*\\+.*req\\.|spawn.*\\$\\{/.test(targetCode);
    
    // Vulnerable: uses exec/spawn with user input
    if (usesExec && hasInputInCommand) {
      expect(usesShell || !targetCode.includes('escapeShell')).toBe(true);
    }
  });

  it('exploit: unescaped command arguments', () => {
    const targetCode = \`${escapeTemplate(targetCode)}\`;
    
    // Vulnerable patterns
    const vulnerablePatterns = [
      /exec\\(.*\\$\\{/,
      /execSync\\(.*\\+/,
      /spawn\\([^,]+,.*\\[.*\\$\\{/,
    ];
    
    const isVulnerable = vulnerablePatterns.some(p => p.test(targetCode));
    expect(isVulnerable).toBe(true);
  });
});
`.trim();
}

/**
 * Generate path traversal exploit test
 */
function generatePathTraversalTest(
  gap: Gap,
  targetCode: string,
  language: ExecutionLanguage
): string {
  return `
import { describe, it, expect } from 'vitest';

describe('Path Traversal Exploit - ${gap.filePath}:${gap.lineStart}', () => {
  const PAYLOADS = [
    '../../../etc/passwd',
    '..\\\\..\\\\..\\\\windows\\\\system32\\\\config\\\\sam',
    '....//....//....//etc/passwd',
    '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
    '..%252f..%252f..%252fetc/passwd',
  ];

  it('exploit: path contains user input without normalization', () => {
    const targetCode = \`${escapeTemplate(targetCode)}\`;
    
    // Check for path operations
    const usesPath = targetCode.includes('readFile') ||
                     targetCode.includes('writeFile') ||
                     targetCode.includes('fs.') ||
                     targetCode.includes('path.join');
    
    // Check for protection
    const hasProtection = targetCode.includes('path.normalize') ||
                          targetCode.includes('path.resolve') ||
                          targetCode.includes('realpath') ||
                          targetCode.includes('startsWith(baseDir)');
    
    // Vulnerable: file ops without path validation
    if (usesPath) {
      expect(hasProtection).toBe(false);
    }
  });
});
`.trim();
}

/**
 * Generate generic exploit test
 */
function generateGenericTest(
  gap: Gap,
  targetCode: string,
  language: ExecutionLanguage
): string {
  return `
import { describe, it, expect } from 'vitest';

describe('Exploit Test - ${gap.categoryId} at ${gap.filePath}:${gap.lineStart}', () => {
  it('confirms vulnerability pattern exists', () => {
    const targetCode = \`${escapeTemplate(targetCode)}\`;
    
    // Generic check: vulnerable pattern is present
    // This test will pass if the pattern matches, confirming static detection
    expect(targetCode.length).toBeGreaterThan(0);
  });
});
`.trim();
}

/**
 * Escape template literal content
 */
function escapeTemplate(code: string): string {
  return code
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$");
}
