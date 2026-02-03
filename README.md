# Pinata

AI-powered security scanner that finds vulnerabilities hiding in your codebase. 47 detection categories across security, data integrity, concurrency, and performance domains.

## Quick Start

```bash
# Fast scan (pattern matching only, ~2s)
npx --yes pinata-security-cli@latest analyze .

# AI-verified scan (eliminates false positives, ~2-3min)
ANTHROPIC_API_KEY=sk-ant-xxx npx --yes pinata-security-cli@latest analyze . --verify
```

## What It Does

```
$ pinata analyze . --verify

Pinata Score: 100/100 (A)

AI Verification: 351 total → 18 pre-filtered → 0 verified, 333 AI-dismissed

No gaps detected! Your codebase has good test coverage.
```

Without `--verify`, you get fast pattern-based detection. With `--verify`, AI analyzes each match to filter false positives.

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
pinata analyze . --execute          # Dynamic execution (requires Docker)
pinata analyze . --execute --dry-run  # Preview tests without running
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
--domain <domain>     # security, data, concurrency, etc.
--severity <level>    # critical, high, medium, low
--exclude <dirs>      # Comma-separated directories to skip
```

## AI Verification

The `--verify` flag uses AI to analyze each pattern match and filter false positives:

```bash
# Set API key (one time)
pinata config set anthropic-api-key sk-ant-xxx
# Or use environment variable
export ANTHROPIC_API_KEY=sk-ant-xxx

# Run AI-verified scan
pinata analyze . --verify
```

**How it works:**
- Patterns cast a wide net (351 matches)
- AI analyzes each match in context
- False positives are dismissed with reasoning
- Only real vulnerabilities remain (often 0-5)

**Performance:** ~2.5 minutes for 350 matches (batched 10/request, 3 concurrent)

## Dynamic Execution (Layer 5)

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

**GitHub Actions**
```yaml
name: Security Scan
on: [push, pull_request]

jobs:
  pinata:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Pinata
        run: npx --yes pinata-security-cli@latest analyze . --output sarif > results.sarif
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
