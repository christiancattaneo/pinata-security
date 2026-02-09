# Pinata

AI-powered security scanner that finds vulnerabilities hiding in your codebase. 47 detection categories across security, data integrity, concurrency, and performance domains. Context-aware scanning adjusts rules based on your project type.

## Quick Start

```bash
# Fast scan (pattern matching only, ~2s)
npx --yes pinata-security-cli@latest analyze .

# AI-verified scan (eliminates false positives)
npx --yes pinata-security-cli@latest analyze . --verify
# Prompts for API key if not configured - saved for future runs
```

## What It Does

```
$ pinata analyze . --verify

Analyzing: /path/to/project
Project: Web server (high confidence)    # Auto-detected
Files: 136 | Languages: Typescript

Pinata Score: 100/100 (A)

AI Verification: 351 total → 0 verified, 351 AI-dismissed

No gaps detected! Your codebase has good test coverage.
```

**Key features:**
- **Project type detection** - Adjusts rules for CLI, web server, library, serverless, etc.
- **AI verification** - Eliminates false positives with Claude/GPT analysis
- **Interactive setup** - Prompts for API key on first `--verify` run

## Installation

```bash
# Via npx (no install)
npx --yes pinata-security-cli@latest analyze .

# Global install  
npm install -g pinata-security-cli
pinata analyze .
```

## Commands

```bash
pinata analyze .                    # Fast scan
pinata analyze . --verify           # AI-verified scan
pinata generate --gaps --write      # Generate adversarial tests for findings
pinata generate --gaps --property   # Also generate property-based invariants
pinata analyze . --execute          # Dynamic execution (requires Docker)
pinata analyze . --confidence low   # Include all matches
pinata analyze . --output json      # JSON output
pinata analyze . --output sarif     # SARIF for GitHub
pinata generate --gaps              # Generate tests for gaps
pinata audit-deps                   # Check npm dependencies
pinata config set anthropic-api-key sk-ant-xxx
```

## Detection Categories

47 categories across 7 risk domains:

**Security (17)** - SQL injection, XSS, command injection, path traversal, SSRF, XXE, CSRF, deserialization, hardcoded secrets, LDAP injection, timing attacks, auth failures, file upload, data exposure, rate limiting, dependency risks, prompt injection

**Data (8)** - Data race, truncation, precision loss, validation, null handling, encoding, schema migration, bulk operations

**Concurrency (6)** - Deadlock, race condition, missing timeout, missing idempotency, retry storm, thread safety

**Reliability (6)** - Network partition, timeout, thundering herd, connection failure, high latency, packet loss

**Performance (3)** - Blocking I/O, memory bloat, CPU spin

**Resource (3)** - Memory leak, connection pool exhaustion, file handle leak

**Input (3)** - Injection fuzzing, boundary testing, null/undefined handling

## Configuration

Create `.pinataignore` to exclude paths:

```
tests/
scripts/
*.test.ts
node_modules/
dist/
```

**CLI options:**

```bash
--verify              # AI verification (requires API key)
--execute             # Dynamic test execution (requires Docker)
--dry-run             # Preview generated tests without running
--confidence <level>  # high (default), medium, low
--output <format>     # terminal, json, sarif, junit, markdown
--output-file <path>  # Write results to file (for SARIF upload)
--domains <domains>   # security, data, concurrency, etc.
--severity <level>    # critical, high, medium, low
--exclude <dirs>      # Comma-separated directories to skip
```

## AI Verification

The `--verify` flag uses AI to analyze each pattern match and filter false positives:

```bash
# Just run it - prompts for API key if needed
pinata analyze . --verify

# Enter your Anthropic or OpenAI API key: sk-ant-xxx
# API key saved to ~/.pinata/config.json
```

**Alternative setup methods:**
```bash
pinata config set anthropic-api-key sk-ant-xxx   # Save to config
export ANTHROPIC_API_KEY=sk-ant-xxx              # Environment variable
```

**How it works:**
- Patterns cast a wide net (351 matches)
- AI analyzes each match in context
- False positives are dismissed with reasoning
- Only real vulnerabilities remain (often 0-5)

**Performance:** ~2.5 minutes for 350 matches (batched 10/request, 3 concurrent)

## Project Type Detection

Pinata auto-detects your project type and adjusts scanning rules accordingly:

| Type | Detection | Adjustments |
|------|-----------|-------------|
| CLI | `bin` field, commander/yargs | Blocking I/O allowed, SSRF skipped |
| Web Server | express/fastify deps | SQL injection weighted higher |
| API | routes/, NestJS/tRPC | CSRF skipped, auth weighted higher |
| Frontend SPA | react/vue deps | SQL injection skipped |
| SSR Framework | next.config.js | XSS weighted higher |
| Serverless | serverless.yml | Memory leaks skipped |
| Library | exports field | Rate limiting skipped |

This reduces false positives by ~60% for specialized project types.

## Adversarial Test Generation

The `generate` command creates complete, runnable security tests from vulnerability findings. Not templates. Real test files with real imports targeting your specific code.

```bash
# Generate tests for all findings (dry run)
pinata generate --gaps

# Write test files to disk
pinata generate --gaps --write

# Include property-based invariant tests (fast-check/hypothesis)
pinata generate --gaps --write --property
```

**How it works:**
1. Extracts the full function, imports, framework, and database type from each finding
2. AI generates a complete test file targeting the specific vulnerable code path
3. Generated test is validated: it must **fail** against current code (if it passes, it's useless)
4. Mutation testing (Stryker) verifies the test actually catches bugs

**Output:**
```
$ pinata generate --gaps --write

  + tests/security/sqli-users.test.ts
    SQL injection test for getUserById at api/users.ts:47
  + tests/security/xss-comments.test.ts
    XSS test for renderComment at views/comments.tsx:23

Wrote 2 test files. Tests fail against current code.
Fix the code, tests will pass. Add to CI to prevent regressions.
```

**Mutation testing:** Pinata's own test suite achieves **100% mutation kill rate** on covered code (350 tests, verified by Stryker). This is the only honest metric for test quality.

## Dynamic Execution (Layer 6)

The `--execute` flag runs generated exploit tests in a Docker sandbox to **prove** vulnerabilities exist:

```bash
# Requires Docker
pinata analyze . --execute

# Preview tests without running
pinata analyze . --execute --dry-run
```

**How it works:**
- Generates exploit tests for each vulnerability
- Runs tests in isolated Docker container (no network, limited resources)
- Reports **CONFIRMED** vs **POTENTIAL** vulnerabilities
- Evidence includes payload and actual exploit result

**Testable vulnerability types:**
- SQL injection (boolean blind, UNION attacks)
- XSS (script injection, innerHTML)
- Command injection (shell metacharacters)
- Path traversal (../ attacks)

**Security constraints:**
- Network disabled (no exfiltration)
- 1 CPU, 512MB RAM, 30s timeout
- Read-only filesystem, unprivileged user
- No capabilities

## CI/CD Integration

**GitHub Action (recommended)**

```yaml
name: Security Scan
on: [push, pull_request]

jobs:
  security:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@v4
      - uses: christiancattaneo/pinata-security@v1
        with:
          confidence: high
          sarif-output: pinata.sarif
      # Optional: AI verification
      # with:
      #   verify: true
      # env:
      #   ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

**Action inputs:**
- `path` - Directory to scan (default: `.`)
- `confidence` - high, medium, low (default: `high`)
- `domains` - Comma-separated domains to scan
- `verify` - Enable AI verification (default: `false`)
- `fail-on-gaps` - Fail if gaps found (default: `true`)
- `sarif-output` - Path for SARIF file (auto-uploads to GitHub Security)

**Action outputs:**
- `score` - Pinata score (0-100)
- `gaps` - Number of gaps found
- `sarif-file` - Path to SARIF file

**Manual workflow (any CI)**
```yaml
- run: npx --yes pinata-security-cli@latest analyze . --output sarif --output-file results.sarif
- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: results.sarif
```

**GitLab CI**
```yaml
security-scan:
  image: node:20
  script:
    - npx --yes pinata-security-cli@latest analyze . --output json > pinata.json
  artifacts:
    reports:
      sast: pinata.json
```

## Output Formats

- `terminal` - Human-readable with colors (default)
- `json` - Machine-readable JSON
- `sarif` - SARIF 2.1.0 for GitHub Advanced Security
- `junit` - JUnit XML for CI systems
- `markdown` - Markdown report

## Performance

| Codebase Size | Time |
|---------------|------|
| 100 files | ~0.5s |
| 1,000 files | ~2s |
| 10,000 files | ~15s |

## Development

```bash
git clone https://github.com/christiancattaneo/pinata-security.git
cd pinata-security
npm install
npm run build
npm test
```

## Documentation

- [Getting Started](https://pinata.sh/docs.html)
- [All Categories](https://pinata.sh/categories.html)
- [How It Works](https://pinata.sh/how-it-works.html)

## License

MIT
