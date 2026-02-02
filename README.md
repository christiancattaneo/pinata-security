# Pinata

AI-powered test coverage analysis and generation. Pinata scans codebases to identify test coverage gaps across security, data integrity, concurrency, and other risk domains, then generates targeted tests using AI-powered templates.

## Features

- **Multi-domain analysis**: security, data, concurrency, input validation, resources, reliability
- **Pattern detection**: regex and AST-based pattern matching for Python, TypeScript, JavaScript
- **Test generation**: templates for pytest, jest, vitest, mocha frameworks
- **Multiple output formats**: terminal, JSON, markdown, SARIF, HTML, JUnit XML
- **CI/CD ready**: GitHub Actions workflow, SARIF for Code Scanning, JUnit for test reporters

## Installation

```bash
npm install -g pinata
```

## Quick Start

```bash
# Initialize config
pinata init

# Analyze codebase
pinata analyze ./src

# Generate tests for detected gaps
pinata generate --write
```

## Commands

| Command | Description |
|---------|-------------|
| `pinata analyze [path]` | Scan for test coverage gaps |
| `pinata generate` | Generate tests for detected gaps |
| `pinata list` | List all detection categories |
| `pinata search <query>` | Search categories by keyword |
| `pinata init` | Create .pinata.yml config |
| `pinata auth login` | Configure API key |

## Output Formats

```bash
pinata analyze ./src --output terminal   # colored terminal output
pinata analyze ./src --output json       # JSON for programmatic use
pinata analyze ./src --output markdown   # markdown report
pinata analyze ./src --output sarif      # GitHub Code Scanning
pinata analyze ./src --output html       # standalone HTML report
pinata analyze ./src --output junit-xml  # CI test reporter
```

## Performance

Benchmarked on synthetic codebases with realistic patterns:

| Metric | Target | Actual |
|--------|--------|--------|
| 100 files | <5s | ~0.5s |
| 1,000 files | <60s | ~5s |
| 10,000 files | <10min | ~50s |
| Pattern matching p95 | <50ms | ~1.5ms |
| Template rendering p95 | <100ms | ~0.5ms |
| Memory (1k files) | <500MB | ~100MB |

## Accuracy

Measured against labeled vulnerable and safe code samples:

| Metric | Current |
|--------|---------|
| True positive rate | >50% |
| False positive rate | tracked |
| Per-category metrics | tracked |

Detection accuracy varies by category. Security-focused patterns (SQL injection, XSS, command injection) have higher confidence. Low-confidence patterns flag code for manual review.

## Detection Categories

45 detection categories across 10 risk domains:

- **Security**: SQL injection, XSS, command injection, path traversal, CSRF, XXE, deserialization, SSRF, secrets, timing attacks
- **Data**: validation, races, migrations, truncation, encoding, null handling
- **Concurrency**: deadlocks, race conditions, thread safety, idempotency, timeouts
- **Input**: boundary testing, null/undefined, injection fuzzing
- **Network**: timeouts, partitions, latency, connection failures
- **Resource**: memory leaks, file handles, connection pools
- **Performance**: blocking I/O, CPU spin, memory bloat

## Configuration

Create `.pinata.yml` in your project root:

```yaml
include:
  - "src/**/*.ts"
  - "src/**/*.py"

exclude:
  - "node_modules/**"
  - "**/*.test.ts"

domains:
  - security
  - data
  - concurrency

minSeverity: medium

thresholds:
  critical: 0
  high: 5
```

## CI/CD Integration

### GitHub Actions

```yaml
- name: Run Pinata
  run: pinata analyze ./src --output sarif > results.sarif

- name: Upload SARIF
  uses: github/codeql-action/upload-sarif@v2
  with:
    sarif_file: results.sarif
```

### Fail on Critical Gaps

```bash
pinata analyze ./src --fail-on critical
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run benchmarks
npm run benchmark

# Lint
npm run lint

# Type check
npm run typecheck
```

## Test Suite

- **752+ tests** covering core functionality
- **Benchmarks** for performance regression detection
- **Accuracy corpus** for detection quality tracking
- **Security tests** for tool safety (path traversal, ReDoS, injection)
- **Edge case tests** for robustness (unicode, concurrency, large files)

## License

MIT
