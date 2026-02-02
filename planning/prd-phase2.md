# Pinata Phase 2 PRD: Hardening

**Status:** Draft
**Scope:** Test rigor, performance validation, security hardening, CLI completion

---

## Problem Statement

Phase 1 delivered functional core components. However, the test suite validates that code **runs** but not that it **works well**. Critical gaps exist between claimed capabilities and proven guarantees.

**Specific deficiencies:**

1. **Performance claims unproven** — PRD promises "<60s for 1k files" with zero benchmarks
2. **Accuracy unmeasured** — claiming ">85% true positive rate" without measurement infrastructure
3. **Security untested** — a security analysis tool with no security testing is a liability
4. **CLI incomplete** — `search`, `init`, `auth` commands are stubs; no integration tests
5. **Output formats partial** — SARIF, HTML, JUnit XML not implemented despite PRD listing
6. **Blindspots unaddressed** — `categories.md` lists 28 edge case categories, most untested

---

## Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| Performance | <60s for 1,000 files | Automated benchmark in CI |
| Memory | <500MB for 1,000 files | Heap snapshot validation |
| True positive rate | >85% | Curated test corpus with known vulnerabilities |
| False positive rate | <15% | Same corpus, validated by human review |
| Test coverage | >80% line coverage on src/ | `vitest --coverage` |
| Security | Zero critical/high vulns | `npm audit`, custom security tests |
| CLI completion | All commands functional | End-to-end integration tests |

---

## Requirements

### R1: Performance Testing

**Goal:** Prove the system meets stated performance targets.

**Tests required:**

1. **Benchmark: 100 files** — baseline, must complete <5s
2. **Benchmark: 1,000 files** — primary target, must complete <60s
3. **Benchmark: 10,000 files** — stress test, must complete <10min with <2GB memory
4. **Pattern matching per file** — p95 <50ms
5. **Template rendering per test** — p95 <100ms
6. **Memory profiling** — no leaks over 1,000 file scan

**Infrastructure:**
- Synthetic test corpus generator (configurable file count, language mix)
- Heap snapshot comparison before/after scan
- CI job that fails build if benchmarks regress >10%

### R2: Accuracy Testing

**Goal:** Measure and enforce detection quality.

**Tests required:**

1. **True positive corpus** — 50+ code samples with known vulnerabilities
   - Each sample tagged with expected category, line, severity
   - Scanner must detect each with correct category
   - Track detection rate per category

2. **False positive corpus** — 50+ safe code samples
   - Includes common false positive triggers (parameterized queries, sanitized output)
   - Scanner must not flag these
   - Track FP rate per pattern

3. **Accuracy metrics:**
   - Per-category precision/recall
   - Overall F1 score
   - Regression detection (new version must not decrease accuracy)

**Infrastructure:**
- `tests/corpus/vulnerable/` directory with labeled samples
- `tests/corpus/safe/` directory with clean code
- JSON manifest mapping files to expected detections
- CI report showing accuracy metrics per run

### R3: Security Testing

**Goal:** Validate the tool is secure against common attack vectors.

**Tests required:**

1. **Path traversal resistance**
   - Malicious file paths: `../../../etc/passwd`, null bytes
   - Category definition paths must be sandboxed

2. **Regex denial of service (ReDoS)**
   - Test all detection patterns against ReDoS payloads
   - Timeout enforcement on pattern matching

3. **Template injection**
   - Malicious variable values: `{{constructor.constructor('return this')()}}`
   - Verify no code execution through template engine

4. **YAML deserialization**
   - Malicious YAML in category definitions
   - No arbitrary code execution on category load

5. **Dependency security**
   - `npm audit` in CI with zero critical/high tolerance
   - Lock file integrity check

6. **Secret scanning**
   - Verify generated tests never contain API keys, passwords
   - Scan outputs before writing

### R4: CLI Integration Testing

**Goal:** End-to-end validation of CLI commands.

**Tests required:**

1. **`pinata analyze`**
   - Scan real directory, verify output format
   - Test all output formats: terminal, json, markdown, sarif
   - Test `--fail-on` exit codes
   - Test domain/severity/confidence filters

2. **`pinata generate`**
   - Generate tests from cached results
   - Verify generated files are syntactically valid
   - Test `--dry-run` vs `--write` modes

3. **`pinata search`** (currently stub)
   - Implement and test search functionality
   - Test query matching, filtering, pagination

4. **`pinata list`**
   - Test all filter combinations
   - Verify output formats

5. **`pinata init`** (currently stub)
   - Create `.pinata.yml` with defaults
   - Detect project type and configure appropriately

6. **`pinata auth`** (currently stub)
   - API key storage in OS keychain
   - Key validation before storage
   - Logout/key removal

### R5: Missing Output Formats

**Goal:** Implement all PRD-specified output formats.

**Formats to implement:**

1. **SARIF** — GitHub Security tab integration
   - Schema-compliant output
   - Maps gaps to SARIF results with locations

2. **HTML** — Standalone shareable report
   - Single-file HTML with embedded CSS
   - Interactive: sortable tables, collapsible sections

3. **JUnit XML** — CI/CD test result integration
   - Each gap as a test case
   - Severity mapped to failure type

### R6: Edge Case / Blindspot Testing

**Goal:** Test the 28 blindspot categories from `categories.md`.

**Priority 1 (data integrity):**
- Race conditions in concurrent file writes
- State corruption recovery (corrupted JSON, empty files)
- Path security (null bytes, traversal, shell injection)

**Priority 2 (reliability):**
- Empty/null data handling (empty projects, dotfiles-only)
- Infinite loop protection (regex backtracking, depth limits)
- Memory/unbounded growth (array caps, large files)

**Priority 3 (edge cases):**
- File system: deep nesting, circular symlinks, binary files, long filenames
- Unicode handling in file content and paths
- Git edge cases (no commits, missing .git, corrupted HEAD)

**Priority 4 (advanced):**
- Fuzzing infrastructure using fast-check
- Property-based testing for template renderer
- Metamorphic testing for detection consistency

---

## Non-Requirements (Out of Scope)

- Web dashboard (Phase 3)
- IDE plugins (Phase 3)
- Go/Java/Rust language support expansion (Phase 3)
- LLM-powered test enhancement (Phase 3)
- Custom category definition UI (Phase 3)

---

## Dependencies

- `fast-check` — property-based testing
- `clinic` or `0x` — performance profiling
- `memwatch-next` or built-in Node heap snapshots — memory leak detection
- `@microsoft/sarif-js` — SARIF output generation

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Performance targets unachievable | High | Early benchmarking, architecture changes if needed |
| ReDoS in existing patterns | High | Audit all patterns with safe-regex before merge |
| Accuracy below 85% | Medium | Tune patterns, add negative patterns, consider ML |
| SARIF schema complexity | Low | Use existing library, validate against schema |

---

## Open Questions

1. **Accuracy corpus source** — should we use real CVE examples, synthetic code, or open-source projects with known vulnerabilities?

2. **Keychain integration** — cross-platform (macOS Keychain, Windows Credential Manager, Linux Secret Service) or simpler encrypted file?

3. **Benchmark CI** — dedicated performance runner or sample-based in regular CI?
