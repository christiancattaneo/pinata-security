# Authoring Detection Categories

Guide to creating and customizing detection categories.

## Category Structure

Each category is a YAML file with the following structure:

```yaml
id: sql-injection
version: 1
name: SQL Injection
description: |
  Detects SQL queries built with string concatenation or template 
  literals that include user input. Attackers can inject malicious 
  SQL to read, modify, or delete data.
domain: security
level: integration
priority: P0
severity: critical
applicableLanguages:
  - python
  - typescript
  - javascript

cves:
  - CVE-2023-1234

references:
  - https://cwe.mitre.org/data/definitions/89.html
  - https://owasp.org/www-community/attacks/SQL_Injection

detectionPatterns:
  # Patterns defined here

testTemplates:
  # Test templates defined here

examples:
  # Examples defined here

createdAt: 2024-01-01
updatedAt: 2024-01-01
```

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier, lowercase with hyphens |
| `version` | number | Schema version (always 1) |
| `name` | string | Human-readable name |
| `description` | string | Detailed description of the vulnerability |
| `domain` | enum | Risk domain |
| `level` | enum | Test level |
| `priority` | enum | Priority level |
| `severity` | enum | Severity level |
| `applicableLanguages` | array | Languages this category applies to |
| `detectionPatterns` | array | At least one pattern |
| `testTemplates` | array | At least one template |
| `examples` | array | At least one example |

## Domains

```yaml
domain: security     # Authentication, authorization, injection, secrets
domain: data         # Validation, integrity, encoding, truncation
domain: concurrency  # Race conditions, deadlocks, thread safety
domain: input        # Boundary testing, fuzzing, null handling
domain: resource     # Memory leaks, connection pools, file handles
domain: reliability  # Network issues, partitions, timeouts
domain: performance  # Blocking I/O, memory bloat, CPU spin
```

## Severity Levels

```yaml
severity: critical   # Remote code execution, data breach potential
severity: high       # Significant security or stability risk
severity: medium     # Moderate risk, may need context
severity: low        # Minor issue, informational
```

## Priority Levels

```yaml
priority: P0   # Must fix before release
priority: P1   # Should fix soon
priority: P2   # Fix when convenient
```

## Detection Patterns

Patterns match code that may have vulnerabilities.

### Regex Patterns

```yaml
detectionPatterns:
  - id: ts-template-literal-query
    type: regex
    language: typescript
    pattern: "(query|execute).*`.*\\$\\{"
    confidence: high
    description: Detects template literals in SQL queries
    negativePattern: "parameterized|prepared|sanitize"
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Unique pattern ID within category |
| `type` | yes | `regex` or `ast` |
| `language` | yes | Target language |
| `pattern` | yes | Regex pattern to match |
| `confidence` | yes | `high`, `medium`, or `low` |
| `description` | yes | What the pattern detects |
| `negativePattern` | no | Regex that indicates safe code |

### Pattern Guidelines

**Be specific to reduce false positives**

```yaml
# Too broad - matches any template literal
pattern: "`.*\\$\\{.*`"

# Better - matches SQL-specific patterns
pattern: "(query|execute|sql).*`.*\\$\\{"

# Best - includes function context
pattern: "\\.(query|execute|run)\\s*\\(\\s*`[^`]*\\$\\{[^}]+\\}"
```

**Use negative patterns for safe code**

```yaml
pattern: "\\$\\{.*\\}.*WHERE"
negativePattern: "parameterized|prepared|sanitized|escaped"
```

**Set appropriate confidence levels**

- `high` - Few false positives, clear vulnerability
- `medium` - May need context, could be safe
- `low` - Informational, requires review

### Supported Languages

```yaml
language: python
language: typescript
language: javascript
language: go
```

## Test Templates

Templates for generating security tests.

```yaml
testTemplates:
  - id: jest-sql-injection
    language: typescript
    framework: jest
    template: |
      import { {{functionName}} } from '{{modulePath}}';
      
      describe('{{className}} SQL Injection Tests', () => {
        const maliciousInputs = [
          "'; DROP TABLE users; --",
          "1' OR '1'='1",
          "1; SELECT * FROM passwords",
          "\\'; DELETE FROM users WHERE \\'a\\'=\\'a",
        ];
        
        it('rejects SQL injection attempts', async () => {
          for (const input of maliciousInputs) {
            await expect({{functionCall}}(input))
              .rejects.toThrow(/invalid|rejected|sanitiz/i);
          }
        });
        
        it('uses parameterized queries', () => {
          // Verify implementation uses prepared statements
          expect({{usesPreparedStatements}}).toBe(true);
        });
      });
    variables:
      - name: className
        type: string
        description: Class name being tested
        required: true
      - name: functionName
        type: string
        description: Function name to import
        required: true
      - name: functionCall
        type: string
        description: Complete function call expression
        required: true
      - name: modulePath
        type: string
        description: Import path for the module
        required: true
      - name: usesPreparedStatements
        type: boolean
        description: Whether implementation uses prepared statements
        required: false
        defaultValue: true
```

### Template Variables

```yaml
variables:
  - name: className
    type: string           # string, number, boolean, array
    description: The class being tested
    required: true         # Must be provided
    
  - name: iterations
    type: number
    description: Number of test iterations
    required: false
    defaultValue: 100      # Used if not provided
```

### Variable Placeholders

Use `{{variableName}}` in templates:

```yaml
template: |
  import { {{functionName}} } from '{{modulePath}}';
  
  test('{{testDescription}}', () => {
    const result = {{functionCall}}({{testInput}});
    expect(result).toBe({{expectedOutput}});
  });
```

## Examples

Examples show vulnerable code and tests:

```yaml
examples:
  - name: basic-sql-injection
    concept: |
      String concatenation in SQL queries allows attackers to inject 
      malicious SQL. Always use parameterized queries.
    vulnerableCode: |
      async function getUser(userId: string) {
        // VULNERABLE: String concatenation
        const query = `SELECT * FROM users WHERE id = '${userId}'`;
        return await db.query(query);
      }
    testCode: |
      describe('getUser', () => {
        it('prevents SQL injection', async () => {
          const malicious = "'; DROP TABLE users; --";
          
          // Should either sanitize or reject
          await expect(getUser(malicious))
            .rejects.toThrow(/invalid/);
        });
      });
    language: typescript
    severity: critical
    cve: CVE-2023-1234
```

## Custom Categories

Add project-specific categories.

### Project Location

Create `.pinata/categories/` in your project:

```
myproject/
├── .pinata/
│   └── categories/
│       └── my-custom-auth.yml
├── src/
└── package.json
```

### Example: Custom Auth Category

```yaml
# .pinata/categories/legacy-auth-deprecation.yml
id: legacy-auth-deprecation
version: 1
name: Legacy Authentication Deprecation
description: |
  Detects usage of deprecated authentication functions that should 
  be migrated to the new auth system.
domain: security
level: unit
priority: P1
severity: high
applicableLanguages:
  - typescript

detectionPatterns:
  - id: legacy-authenticate-function
    type: regex
    language: typescript
    pattern: "legacyAuthenticate\\s*\\("
    confidence: high
    description: Deprecated legacyAuthenticate function

  - id: old-session-manager
    type: regex
    language: typescript
    pattern: "OldSessionManager\\.(create|verify|refresh)"
    confidence: high
    description: Deprecated OldSessionManager class

  - id: password-md5-hash
    type: regex
    language: typescript
    pattern: "md5\\s*\\(.*password"
    confidence: high
    description: MD5 password hashing

testTemplates:
  - id: jest-no-legacy-auth
    language: typescript
    framework: jest
    template: |
      describe('Authentication', () => {
        it('does not use legacy auth functions', () => {
          // This test will fail if legacy code is still present
          const source = require('fs').readFileSync('{{filePath}}', 'utf8');
          expect(source).not.toMatch(/legacyAuthenticate/);
          expect(source).not.toMatch(/OldSessionManager/);
        });
      });
    variables:
      - name: filePath
        type: string
        description: Path to the source file
        required: true

examples:
  - name: legacy-auth-function
    concept: |
      The legacyAuthenticate function uses outdated security practices.
      Migrate to AuthService.authenticate().
    vulnerableCode: |
      import { legacyAuthenticate } from './old-auth';
      
      async function login(username: string, password: string) {
        return legacyAuthenticate(username, password);
      }
    testCode: |
      describe('login', () => {
        it('uses new auth service', async () => {
          const result = await login('user', 'pass');
          expect(result.provider).toBe('AuthService');
        });
      });
    language: typescript
    severity: high

createdAt: 2024-01-01
updatedAt: 2024-01-01
```

## Validation

Pinata validates categories on load:

- ID format: lowercase letters, numbers, hyphens
- Required fields present
- Valid enum values
- At least one pattern, template, and example
- Pattern regex syntax valid

Invalid categories are skipped with a warning.

## Testing Categories

### Verify Pattern Matches

```bash
# Create test file with vulnerable code
echo 'const query = `SELECT * FROM users WHERE id = ${id}`;' > test.ts

# Scan with verbose output
pinata analyze test.ts --verbose

# Should detect sql-injection
```

### Test Against Corpus

Create test files in `tests/corpus/`:

```
tests/corpus/
├── vulnerable/
│   └── sql-injection/
│       ├── template-literal.ts
│       ├── string-concat.py
│       └── f-string.py
└── safe/
    └── sql-injection/
        ├── parameterized.ts
        └── prepared-statement.py
```

Run corpus tests:

```bash
npm run test:corpus
```

## Best Practices

**1. Start specific, broaden carefully**

Begin with high-confidence patterns that have few false positives. Add broader patterns with lower confidence.

**2. Include negative patterns**

Reduce false positives by detecting safe patterns:

```yaml
pattern: "exec\\s*\\("
negativePattern: "execFile|execSync.*\\{\\s*encoding"
```

**3. Test against real code**

Run patterns against real-world codebases to find false positives before releasing.

**4. Document the vulnerability**

Clear descriptions help developers understand and fix issues.

**5. Provide safe examples**

Show the correct way to write the code in test templates.

**6. Reference standards**

Include CWE numbers, OWASP references, and CVEs when applicable.
