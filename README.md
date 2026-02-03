# Pinata

AI-powered security scanner that finds vulnerabilities hiding in your codebase. 45 detection categories across security, data integrity, concurrency, and performance domains.

## Quick Start

```bash
npx --yes pinata-security-cli@latest analyze .
```

That's it. No config needed.

## What It Does

Pinata scans your code for security gaps and test coverage holes:

```
$ pinata analyze ./src

Pinata Score: 85/100 (B)

High Severity Gaps (3):
  🔴 sql-injection      src/db/queries.ts:45
  🔴 hardcoded-secrets  src/config/api.ts:12  
  🔴 missing-timeout    src/http/client.ts:89
```

## Installation

**npx (recommended)**
```bash
npx --yes pinata-security-cli@latest analyze .
```

**Global install**
```bash
npm install -g pinata-security-cli
pinata analyze .
```

## Commands

| Command | Description |
|---------|-------------|
| `pinata analyze [path]` | Scan for security gaps |
| `pinata generate --gaps` | Generate tests for detected gaps |
| `pinata explain <category> <file:line>` | AI explanation of a gap |
| `pinata dashboard` | Interactive TUI dashboard |
| `pinata config set <key> <value>` | Configure API keys |

## Detection Categories

45 categories across 7 risk domains:

**Security (16)** - SQL injection, XSS, command injection, path traversal, SSRF, XXE, CSRF, deserialization, hardcoded secrets, LDAP injection, timing attacks, auth failures, file upload, data exposure, rate limiting, dependency risks

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

CLI options:

```bash
pinata analyze . --confidence medium   # Include medium confidence
pinata analyze . --output json         # JSON output
pinata analyze . --output sarif        # SARIF for GitHub
pinata analyze . --domain security     # Filter by domain
```

## AI Features

Enable AI-powered explanations and test generation:

```bash
# Set API key
pinata config set anthropic-api-key sk-ant-xxx

# Or via environment
export ANTHROPIC_API_KEY=sk-ant-xxx

# Get explanation for a gap
pinata explain sql-injection src/db/queries.ts:45

# Generate tests
pinata generate --gaps
```

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
