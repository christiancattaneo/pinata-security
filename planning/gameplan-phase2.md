# Pinata Phase 2 Gameplan: Hardening

**Duration:** 6 weeks
**Focus:** Test rigor, performance, security, CLI completion

---

## Overview

```
Week 1: Performance Infrastructure    ████░░░░░░░░░░░░░░░░░░░░
Week 2: Accuracy Corpus              ░░░░████░░░░░░░░░░░░░░░░
Week 3: Security Testing             ░░░░░░░░████░░░░░░░░░░░░
Week 4: CLI Completion               ░░░░░░░░░░░░████░░░░░░░░
Week 5: Output Formats               ░░░░░░░░░░░░░░░░████░░░░
Week 6: Blindspot Tests + Polish     ░░░░░░░░░░░░░░░░░░░░████
```

---

## Week 1: Performance Infrastructure

**Goal:** Prove performance claims with automated benchmarks.

### Tasks

| ID | Task | Est | Deps |
|----|------|-----|------|
| 1.1 | Create synthetic corpus generator | 4h | - |
| 1.2 | Benchmark: 100 files (<5s) | 2h | 1.1 |
| 1.3 | Benchmark: 1,000 files (<60s) | 2h | 1.1 |
| 1.4 | Benchmark: 10,000 files (<10min) | 2h | 1.1 |
| 1.5 | Memory profiling: heap snapshot comparison | 4h | 1.1 |
| 1.6 | Per-file pattern matching benchmark (p95 <50ms) | 2h | - |
| 1.7 | Template rendering benchmark (p95 <100ms) | 2h | - |
| 1.8 | CI job: fail on >10% regression | 4h | 1.2-1.7 |

### Deliverables

```
tests/
  benchmarks/
    corpus-generator.ts     # Generates N files with configurable patterns
    scan-benchmark.test.ts  # 100/1k/10k file benchmarks
    memory-benchmark.test.ts # Heap snapshot validation
    pattern-benchmark.test.ts # Per-pattern timing
    template-benchmark.test.ts # Render timing
scripts/
  benchmark.ts              # CLI runner for benchmarks
```

### Corpus Generator Spec

```typescript
interface CorpusOptions {
  fileCount: number;
  languages: { python: number; typescript: number; javascript: number };
  vulnerableRatio: number; // 0.0-1.0, percentage with detectable patterns
  avgLinesPerFile: number;
  maxNestingDepth: number;
}

// Usage: generateCorpus(tempDir, { fileCount: 1000, ... })
```

---

## Week 2: Accuracy Corpus

**Goal:** Measure detection accuracy with labeled test data.

### Tasks

| ID | Task | Est | Deps |
|----|------|-----|------|
| 2.1 | Create vulnerable corpus (50 samples) | 6h | - |
| 2.2 | Create safe corpus (50 samples) | 4h | - |
| 2.3 | Create manifest format (file → expected detections) | 2h | - |
| 2.4 | Implement accuracy test runner | 4h | 2.1-2.3 |
| 2.5 | Per-category precision/recall metrics | 3h | 2.4 |
| 2.6 | Overall F1 score calculation | 1h | 2.4 |
| 2.7 | Accuracy regression CI job | 2h | 2.4-2.6 |
| 2.8 | Tune patterns for categories below 80% recall | 4h | 2.5 |

### Deliverables

```
tests/
  corpus/
    vulnerable/
      sql-injection/
        python-fstring.py     # Expected: sql-injection:8
        ts-template.ts        # Expected: sql-injection:12
      xss/
        react-dangerously.tsx
        innerhtml.ts
      ... (all categories)
    safe/
      parameterized-queries.py
      sanitized-output.ts
      escaped-html.tsx
      ...
    manifest.json             # { "path": [{ category, line, severity }] }
  accuracy/
    accuracy.test.ts          # Main accuracy validation
    metrics.ts                # Precision/recall/F1 calculations
```

### Manifest Format

```json
{
  "vulnerable/sql-injection/python-fstring.py": [
    { "category": "sql-injection", "line": 8, "patternId": "python-fstring-execute" }
  ],
  "safe/parameterized-queries.py": []
}
```

---

## Week 3: Security Testing

**Goal:** Validate tool security against common attack vectors.

### Tasks

| ID | Task | Est | Deps |
|----|------|-----|------|
| 3.1 | Path traversal tests | 3h | - |
| 3.2 | ReDoS pattern audit (safe-regex) | 4h | - |
| 3.3 | ReDoS timeout enforcement | 3h | 3.2 |
| 3.4 | Template injection tests | 3h | - |
| 3.5 | YAML deserialization tests | 2h | - |
| 3.6 | npm audit CI integration (zero tolerance) | 2h | - |
| 3.7 | Generated output secret scanning | 3h | - |
| 3.8 | Null byte injection tests | 2h | - |
| 3.9 | Shell metacharacter tests | 2h | - |

### Deliverables

```
tests/
  security/
    path-traversal.test.ts
    redos.test.ts
    template-injection.test.ts
    yaml-deser.test.ts
    secret-scan.test.ts
    injection.test.ts
src/
  lib/
    safe-regex.ts           # ReDoS-safe regex wrapper with timeout
    path-validator.ts       # Path sanitization utility
```

### ReDoS Audit Approach

```typescript
// Audit all patterns in category definitions
for (const category of store.toArray()) {
  for (const pattern of category.detectionPatterns) {
    if (pattern.type === 'regex') {
      expect(isSafeRegex(pattern.pattern)).toBe(true);
      expect(() => matchWithTimeout(pattern.pattern, EVIL_INPUT, 100)).not.toThrow();
    }
  }
}
```

### Evil Inputs

```typescript
const EVIL_INPUTS = [
  'a'.repeat(50) + '!',                    // Backtracking trigger
  '((((((((((((((((((((a]))))))))))))))))))))', // Nested groups
  '\x00/etc/passwd',                       // Null byte injection
  '../'.repeat(20) + 'etc/passwd',         // Path traversal
  '; rm -rf /',                            // Shell injection
];
```

---

## Week 4: CLI Completion

**Goal:** Implement stub commands and add integration tests.

### Tasks

| ID | Task | Est | Deps |
|----|------|-----|------|
| 4.1 | Implement `pinata search` command | 4h | - |
| 4.2 | Implement `pinata init` command | 3h | - |
| 4.3 | Implement `pinata auth login/logout` | 4h | - |
| 4.4 | E2E test: `pinata analyze` all formats | 4h | - |
| 4.5 | E2E test: `pinata generate` dry-run + write | 3h | - |
| 4.6 | E2E test: `pinata search` queries | 2h | 4.1 |
| 4.7 | E2E test: `pinata list` filters | 2h | - |
| 4.8 | E2E test: `pinata init` creates config | 2h | 4.2 |
| 4.9 | E2E test: `pinata auth` keychain | 2h | 4.3 |

### Deliverables

```
src/
  cli/
    commands/
      search.ts             # Full implementation
      init.ts               # Full implementation
      auth.ts               # Full implementation
  lib/
    keychain.ts             # OS keychain abstraction
tests/
  cli/
    e2e/
      analyze.e2e.test.ts
      generate.e2e.test.ts
      search.e2e.test.ts
      list.e2e.test.ts
      init.e2e.test.ts
      auth.e2e.test.ts
```

### E2E Test Pattern

```typescript
describe('pinata analyze E2E', () => {
  it('scans directory and outputs JSON', async () => {
    const result = await exec('pinata analyze ./fixtures --output json');
    const parsed = JSON.parse(result.stdout);
    expect(parsed.gaps).toBeDefined();
    expect(parsed.score).toBeDefined();
  });

  it('exits 1 on --fail-on critical with critical gaps', async () => {
    const result = await exec('pinata analyze ./fixtures-with-critical --fail-on critical', { reject: false });
    expect(result.exitCode).toBe(1);
  });
});
```

---

## Week 5: Output Formats

**Goal:** Implement SARIF, HTML, and JUnit XML output.

### Tasks

| ID | Task | Est | Deps |
|----|------|-----|------|
| 5.1 | SARIF formatter implementation | 6h | - |
| 5.2 | SARIF schema validation tests | 2h | 5.1 |
| 5.3 | HTML formatter implementation | 6h | - |
| 5.4 | HTML standalone file tests | 2h | 5.3 |
| 5.5 | JUnit XML formatter | 4h | - |
| 5.6 | JUnit XML schema validation | 2h | 5.5 |
| 5.7 | Wire formats into CLI `--output` flag | 2h | 5.1-5.6 |
| 5.8 | Update CLI help and docs | 2h | 5.7 |

### Deliverables

```
src/
  cli/
    sarif-formatter.ts
    html-formatter.ts
    junit-formatter.ts
tests/
  cli/
    sarif-formatter.test.ts
    html-formatter.test.ts
    junit-formatter.test.ts
```

### SARIF Structure

```typescript
interface SarifReport {
  $schema: string;
  version: '2.1.0';
  runs: [{
    tool: { driver: { name: 'Pinata', version: string, rules: SarifRule[] } };
    results: SarifResult[];
  }];
}

interface SarifResult {
  ruleId: string;           // category.id
  level: 'error' | 'warning' | 'note';
  message: { text: string };
  locations: [{
    physicalLocation: {
      artifactLocation: { uri: string };
      region: { startLine: number; startColumn: number };
    };
  }];
}
```

---

## Week 6: Blindspot Tests + Polish

**Goal:** Address remaining edge cases and finalize Phase 2.

### Tasks

| ID | Task | Est | Deps |
|----|------|-----|------|
| 6.1 | Race condition tests (concurrent file writes) | 4h | - |
| 6.2 | State corruption recovery tests | 3h | - |
| 6.3 | Empty/null data handling tests | 2h | - |
| 6.4 | File system edge cases (deep nesting, symlinks) | 4h | - |
| 6.5 | Unicode path and content tests | 2h | - |
| 6.6 | Property-based tests with fast-check | 4h | - |
| 6.7 | Increase line coverage to >80% | 4h | - |
| 6.8 | Update README with accuracy/performance data | 2h | - |
| 6.9 | Final audit and version bump | 1h | all |

### Deliverables

```
tests/
  edge-cases/
    race-conditions.test.ts
    state-corruption.test.ts
    empty-data.test.ts
    filesystem.test.ts
    unicode.test.ts
  property/
    template-properties.test.ts
    pattern-properties.test.ts
```

### Property-Based Test Example

```typescript
import fc from 'fast-check';

describe('TemplateRenderer properties', () => {
  it('substitution is idempotent for resolved templates', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.dictionary(fc.string(), fc.string()),
        (template, vars) => {
          const r1 = renderer.substituteVariables(template, vars);
          const r2 = renderer.substituteVariables(r1.content, vars);
          return r1.content === r2.content;
        }
      )
    );
  });

  it('loop preserves item count', () => {
    fc.assert(
      fc.property(fc.array(fc.string()), (items) => {
        const template = '{{#each items}}X{{/each}}';
        const result = renderer.processLoops(template, { items });
        return result === 'X'.repeat(items.length);
      })
    );
  });
});
```

---

## Success Gates

| Gate | Criteria | Blocking |
|------|----------|----------|
| Performance | All benchmarks pass | Yes |
| Accuracy | F1 > 0.80 across all categories | Yes |
| Security | Zero ReDoS, zero injection vulns | Yes |
| Coverage | >80% line coverage | No |
| CLI | All E2E tests pass | Yes |
| Formats | SARIF validates against schema | Yes |

---

## Dependencies to Install

```bash
npm install --save-dev fast-check safe-regex @microsoft/sarif-js
```

---

## Risk Register

| Risk | Week | Impact | Mitigation |
|------|------|--------|------------|
| Benchmarks show architecture issues | 1 | High | Profile early, refactor if needed |
| Many patterns fail ReDoS check | 3 | High | Rewrite patterns or add timeout wrapper |
| Accuracy below 80% | 2 | Medium | Tune patterns, add more negative patterns |
| Keychain cross-platform complexity | 4 | Medium | Fall back to encrypted file if needed |
| SARIF schema edge cases | 5 | Low | Use official library |

---

## Checkpoint Milestones

| Checkpoint | Week | Deliverable |
|------------|------|-------------|
| C1 | 1 | Benchmarks running in CI |
| C2 | 2 | Accuracy metrics visible in test output |
| C3 | 3 | Security test suite passing |
| C4 | 4 | All CLI commands functional |
| C5 | 5 | All output formats working |
| C6 | 6 | Phase 2 complete, release candidate |
