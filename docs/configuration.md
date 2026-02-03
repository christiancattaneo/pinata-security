# Configuration Guide

How to configure Pinata for your project.

## Quick Reference

| Method | Location | Precedence |
|--------|----------|------------|
| CLI flags | Command line | Highest |
| Environment variables | Shell | High |
| Config file | `~/.pinata/config.json` | Medium |
| Project config | `.pinatarc` | Low |
| Defaults | Built-in | Lowest |

## Exclusion Patterns

### .pinataignore

Create a `.pinataignore` file in your project root to exclude files from scanning. Uses gitignore syntax.

```
# Comments start with #

# Exclude directories
tests/
scripts/
vendor/
node_modules/
dist/
build/
.next/

# Exclude by pattern
*.test.ts
*.spec.js
*.min.js
*.bundle.js

# Exclude specific files
src/legacy/old-code.ts
config/secrets.local.ts
```

### CLI --exclude

Exclude directories via command line:

```bash
pinata analyze . --exclude "tests,scripts,vendor,docs"
```

### Default Exclusions

These directories are excluded by default:
- `node_modules`
- `dist`
- `build`
- `.git`
- `.next`
- `__pycache__`
- `.pytest_cache`
- `coverage`
- `.nyc_output`

## Confidence Levels

Pinata patterns have three confidence levels:

| Level | Description | Default |
|-------|-------------|---------|
| `high` | Very likely a real issue. Few false positives. | Shown |
| `medium` | Likely an issue but may need manual review. | Hidden |
| `low` | Possible issue. Higher false positive rate. | Hidden |

### Setting Minimum Confidence

**CLI flag**
```bash
pinata analyze . --confidence medium
```

**Environment variable**
```bash
export PINATA_CONFIDENCE=medium
pinata analyze .
```

**Config file** (`~/.pinata/config.json`)
```json
{
  "defaultConfidence": "medium"
}
```

## Output Formats

### terminal (default)

Human-readable colored output:

```bash
pinata analyze .
```

### json

Machine-readable JSON for scripting:

```bash
pinata analyze . --output json > results.json
```

Schema:
```json
{
  "targetDirectory": "/path/to/project",
  "scanTime": "2024-01-15T10:30:00Z",
  "score": 85,
  "grade": "B",
  "gaps": [
    {
      "categoryId": "sql-injection",
      "categoryName": "SQL Injection",
      "severity": "critical",
      "confidence": "high",
      "filePath": "src/db/queries.ts",
      "lineStart": 45,
      "lineEnd": 47,
      "codeSnippet": "...",
      "patternId": "ts-template-literal-query"
    }
  ],
  "coverage": {
    "byDomain": {
      "security": { "covered": 15, "total": 16 }
    }
  }
}
```

### sarif

SARIF 2.1.0 for GitHub Advanced Security:

```bash
pinata analyze . --output sarif > results.sarif
```

Upload to GitHub:
```yaml
- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: results.sarif
```

### junit

JUnit XML for CI systems:

```bash
pinata analyze . --output junit > results.xml
```

### markdown

Markdown report for PRs:

```bash
pinata analyze . --output markdown > report.md
```

## Domain Filtering

Scan only specific risk domains:

```bash
# Security only
pinata analyze . --domain security

# Multiple domains
pinata analyze . --domain security --domain data
```

Available domains:
- `security` - Authentication, injection, secrets
- `data` - Validation, races, truncation
- `concurrency` - Deadlocks, timeouts, idempotency
- `reliability` - Network, partitions, thundering herd
- `performance` - Blocking I/O, memory bloat
- `resource` - Leaks, pool exhaustion
- `input` - Fuzzing, boundaries, nulls

## API Keys

### Setting API Keys

For AI features (explanations, test generation):

**CLI config**
```bash
pinata config set anthropic-api-key sk-ant-api03-xxx
pinata config set openai-api-key sk-xxx
```

**Environment variables**
```bash
export ANTHROPIC_API_KEY=sk-ant-api03-xxx
export OPENAI_API_KEY=sk-xxx
```

### Storage Location

API keys are stored in `~/.pinata/config.json` with restrictive permissions (0600).

### Key Precedence

1. Environment variable (if set)
2. Config file value

## Project Configuration

### .pinatarc

Create a `.pinatarc` file in your project root for project-specific settings:

```json
{
  "excludeDirs": ["tests", "scripts", "vendor"],
  "minConfidence": "high",
  "output": "terminal",
  "domains": ["security", "data"],
  "failOn": "critical"
}
```

### Available Options

| Option | Type | Description |
|--------|------|-------------|
| `excludeDirs` | string[] | Directories to exclude |
| `minConfidence` | string | Minimum confidence level |
| `output` | string | Default output format |
| `domains` | string[] | Risk domains to scan |
| `failOn` | string | Fail if gaps at this severity |

## CI/CD Configuration

### Fail on Severity

Exit with code 1 if gaps found at or above a severity:

```bash
# Fail on critical gaps
pinata analyze . --fail-on critical

# Fail on high or critical
pinata analyze . --fail-on high
```

### Caching

For faster CI runs, cache the npm package:

```yaml
# GitHub Actions
- uses: actions/cache@v4
  with:
    path: ~/.npm
    key: npm-pinata-${{ hashFiles('**/package-lock.json') }}
```

### Parallel Scans

For monorepos, scan projects in parallel:

```yaml
jobs:
  scan:
    strategy:
      matrix:
        project: [frontend, backend, shared]
    steps:
      - run: pinata analyze ./${{ matrix.project }}
```

## Debugging

### Verbose Output

```bash
pinata analyze . --verbose
```

Shows:
- Files being scanned
- Categories loaded
- Pattern matches
- Timing information

### Debug Mode

```bash
DEBUG=pinata:* pinata analyze .
```

Shows internal debug logs for troubleshooting.
