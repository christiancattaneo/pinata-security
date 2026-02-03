# CLI Reference

Complete reference for all Pinata CLI commands.

## Global Options

These options work with all commands:

| Option | Description |
|--------|-------------|
| `--version` | Show version number |
| `--help` | Show help |
| `-v, --verbose` | Enable verbose output |

## pinata analyze

Scan a directory for security gaps and test coverage issues.

```bash
pinata analyze [path] [options]
```

**Arguments**

| Argument | Description | Default |
|----------|-------------|---------|
| `path` | Directory or file to scan | `.` (current directory) |

**Options**

| Option | Description | Default |
|--------|-------------|---------|
| `-c, --confidence <level>` | Minimum confidence level: `high`, `medium`, `low` | `high` |
| `-o, --output <format>` | Output format: `terminal`, `json`, `sarif`, `junit`, `markdown` | `terminal` |
| `-d, --domain <domain>` | Filter by risk domain | all |
| `--exclude <dirs>` | Comma-separated directories to exclude | `node_modules,dist` |
| `--fail-on <severity>` | Exit with code 1 if gaps at or above severity | none |
| `-v, --verbose` | Show detailed output including file paths | false |

**Examples**

```bash
# Basic scan
pinata analyze ./src

# Scan with medium confidence
pinata analyze . --confidence medium

# Output JSON for scripting
pinata analyze . --output json > results.json

# SARIF for GitHub Code Scanning
pinata analyze . --output sarif > results.sarif

# Fail CI if critical gaps found
pinata analyze . --fail-on critical

# Scan only security domain
pinata analyze . --domain security

# Exclude specific directories
pinata analyze . --exclude "tests,scripts,vendor"
```

**Exit Codes**

| Code | Meaning |
|------|---------|
| 0 | Success (or gaps found but below `--fail-on` threshold) |
| 1 | Gaps found at or above `--fail-on` severity |
| 2 | Error (invalid path, config error, etc.) |

## pinata generate

Generate security tests for detected gaps. Requires AI API key.

```bash
pinata generate [options]
```

**Options**

| Option | Description | Default |
|--------|-------------|---------|
| `--gaps` | Generate tests for all detected gaps | false |
| `--category <id>` | Generate tests for specific category | all |
| `--framework <name>` | Test framework: `jest`, `vitest`, `pytest`, `mocha` | auto-detect |
| `--output <dir>` | Output directory for generated tests | `./tests/security` |
| `--dry-run` | Show what would be generated without writing | false |

**Examples**

```bash
# Generate tests for all gaps
pinata generate --gaps

# Generate tests for specific category
pinata generate --category sql-injection

# Specify output directory
pinata generate --gaps --output ./src/__tests__/security

# Preview without writing
pinata generate --gaps --dry-run
```

## pinata explain

Get AI-powered explanation of a specific gap. Requires AI API key.

```bash
pinata explain <category> <location>
```

**Arguments**

| Argument | Description |
|----------|-------------|
| `category` | Category ID (e.g., `sql-injection`) |
| `location` | File path with line number (e.g., `src/db.ts:45`) |

**Output includes**

- What the vulnerability is
- Why it's dangerous
- How to fix it
- Safe code example
- References to CWE/OWASP

**Examples**

```bash
pinata explain sql-injection src/db/queries.ts:45
pinata explain xss src/components/Comment.tsx:123
```

## pinata dashboard

Launch interactive TUI dashboard for browsing scan results.

```bash
pinata dashboard
```

**Controls**

| Key | Action |
|-----|--------|
| `↑/↓` | Navigate gaps |
| `Enter` | View gap details |
| `Tab` | Switch between panels |
| `r` | Refresh scan |
| `q` | Quit |

## pinata config

Manage persistent configuration stored in `~/.pinata/config.json`.

### pinata config set

Set a configuration value.

```bash
pinata config set <key> <value>
```

**Available keys**

| Key | Description |
|-----|-------------|
| `anthropic-api-key` | Anthropic Claude API key |
| `openai-api-key` | OpenAI API key |
| `default-confidence` | Default minimum confidence level |
| `default-output` | Default output format |

**Examples**

```bash
pinata config set anthropic-api-key sk-ant-api03-xxx
pinata config set openai-api-key sk-xxx
pinata config set default-confidence medium
```

### pinata config get

Get a configuration value.

```bash
pinata config get <key>
```

The API key will be masked in output for security.

### pinata config list

List all configuration values.

```bash
pinata config list
```

### pinata config unset

Remove a configuration value.

```bash
pinata config unset <key>
```

## Environment Variables

Configuration can also be set via environment variables:

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `PINATA_CONFIDENCE` | Default minimum confidence |
| `PINATA_OUTPUT` | Default output format |
| `NO_COLOR` | Disable colored output |

Environment variables take precedence over config file values.

## Configuration Files

### .pinataignore

Exclude files and directories from scanning. Uses gitignore syntax.

```
# Exclude test files
tests/
*.test.ts
*.spec.js

# Exclude build output
dist/
build/
.next/

# Exclude dependencies
node_modules/
vendor/

# Exclude scripts
scripts/
tools/
```

### .pinatarc

JSON configuration file for project-level settings.

```json
{
  "excludeDirs": ["node_modules", "dist", "vendor"],
  "minConfidence": "high",
  "output": "terminal",
  "domains": ["security", "data", "concurrency"]
}
```

## Programmatic API

Pinata can be used programmatically in Node.js:

```typescript
import { Scanner, CategoryStore } from 'pinata-security-cli';

const store = new CategoryStore();
await store.loadAll();

const scanner = new Scanner(store);
const result = await scanner.scan('./src');

console.log(`Score: ${result.score}/100 (${result.grade})`);
console.log(`Gaps: ${result.gaps.length}`);

for (const gap of result.gaps) {
  console.log(`${gap.categoryName}: ${gap.filePath}:${gap.lineStart}`);
}
```

See [API Reference](./api-reference.md) for detailed programmatic usage.
