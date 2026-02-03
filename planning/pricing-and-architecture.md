# Pinata Pricing and Architecture

## Pricing Model

### Free Tier (always free)
- Static analysis only (no AI verification)
- All 47 categories
- CLI + JSON/SARIF output
- Unlimited local scans
- `pinata analyze .` and `pinata audit-deps`

### Pro ($29/mo or usage-based)
- AI verification (`--verify` flag)
- ~$0.002/gap verified (pass-through Anthropic/OpenAI cost + margin)
- CI/CD integration helpers
- SARIF output for GitHub code scanning
- Web dashboard (future)

### Enterprise (custom pricing)
- Custom category definitions
- SSO/SAML authentication
- Audit logs
- SLA guarantees
- Dynamic test execution (sandboxed)
- On-premise deployment

### Cost Math
```
Per-scan cost breakdown:
- Static analysis: ~$0 (runs locally)
- AI verification: ~$0.002/gap × ~30 gaps avg = $0.06/scan
- Dynamic execution: ~$0.10/test × 30 tests = $3.00/scan

Monthly costs at 100 scans/day:
- Free tier: $0
- Pro (AI only): ~$180/month
- Enterprise (with dynamic): ~$9,000/month
```

---

## Convergence Architecture

The question of "how many analysis layers" is about **signal-to-noise ratio** at each stage.

### Layer Stack

```
Layer 0: Codebase
    │
    ▼ (ingestion)
Layer 1: Static Detection (regex/AST)
    │   ~1000 matches, ~60% false positives
    │   Cost: $0, Latency: <1s
    ▼
Layer 2: Heuristic Pre-filter
    │   Remove test files, node_modules, .d.ts, vendored code
    │   ~400 matches, ~50% false positives
    │   Cost: $0, Latency: <1s
    ▼
Layer 3: AI Semantic Verification
    │   LLM analyzes context, intent, data flow
    │   ~100 gaps, ~15% false positives
    │   Cost: $0.002/gap, Latency: 50ms/gap
    ▼
Layer 4: Test Generation
    │   Generate executable test code from templates
    │   ~100 tests (1:1 with gaps)
    │   Cost: $0.003/gap, Latency: 100ms/gap
    ▼
Layer 5: Dynamic Execution (optional)
    │   Run generated tests in sandboxed environment
    │   Ground truth: vulnerability exists or not
    │   ~85 confirmed vulnerabilities
    │   Cost: $0.05-0.50/test, Latency: 5-30s/test
    ▼
Layer 6: Feedback Loop (async)
    │   Failed tests improve detection patterns
    │   Continuous model improvement
    │   Cost: engineering, compounds over time
```

### Current Implementation (v0.3.0)

| Layer | Status | Notes |
|-------|--------|-------|
| 1 Static | **Implemented** | 47 categories, regex + future AST |
| 2 Heuristic | **Implemented** | SKIP_PATTERNS in ai-verifier.ts |
| 3 AI Verify | **Implemented** | `--verify` flag, batch processing |
| 4 Generate | **Partial** | Templates exist, no auto-execution |
| 5 Dynamic | Not started | Requires sandbox infrastructure |
| 6 Feedback | Not started | Requires telemetry + model training |

### Practical Modes

```bash
# Default: Layers 1-2 (free, fast, ~50% false positives)
pinata analyze .

# Verified: Layers 1-3 (paid, accurate, ~15% false positives)
pinata analyze . --verify

# Deep: Layers 1-4 + test generation
pinata analyze . --verify
pinata generate --gaps

# Enterprise: Layer 5 (run generated tests in sandbox)
# Future: pinata execute --sandbox
```

### Convergence Strategy

**3 layers is the sweet spot** for most users:
- Static → Heuristic → AI achieves ~85% precision
- This is what Snyk/Semgrep provide
- Good balance of cost vs accuracy

**5 layers for ground truth:**
- Dynamic execution **proves** a vulnerability exists
- But requires infrastructure (Docker, sandboxes, fixtures)
- Reserve for P0/critical gaps or enterprise customers

### The Math

```
100 initial static matches
 × 0.7 (heuristic filter)     = 70 matches
 × 0.4 (AI filter)            = 28 verified gaps
 × $0.002                     = $0.056 per scan

With dynamic execution:
 28 tests × $0.10             = $2.80 per scan
```

---

## Implementation Roadmap

### Phase 1: Core (Complete)
- [x] Static detection (47 categories)
- [x] Heuristic pre-filtering
- [x] AI verification (batch + parallel)
- [x] Test template generation
- [x] `audit-deps` command

### Phase 2: Polish
- [ ] AST-based detection (tree-sitter)
- [ ] More language support (Go, Java, Rust)
- [ ] Web dashboard MVP
- [ ] GitHub Action

### Phase 3: Dynamic
- [ ] Sandbox infrastructure (Docker-based)
- [ ] Auto-run generated tests
- [ ] Feedback loop for pattern improvement

### Phase 4: Enterprise
- [ ] SSO/SAML
- [ ] Audit logging
- [ ] Custom categories UI
- [ ] On-premise deployment
