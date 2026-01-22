# Pinata PRD

## Problem Statement

Engineering teams systematically miss critical test categories. Happy-path testing dominates while edge cases, security vulnerabilities, and failure modes go untested until production incidents expose them.

**Root causes:**
- No comprehensive taxonomy of what to test
- Test coverage tools measure lines, not risk domains
- Security testing treated as separate discipline
- Distributed system failures invisible until deployment
- Time pressure forces teams to skip "unlikely" scenarios

**Cost of the gap:**
- Production incidents from untested edge cases
- Security breaches from missing auth/injection tests
- Data corruption from untested transaction/migration paths
- Cascading failures from missing network resilience tests

Research across five AI models confirmed: even experienced teams miss network/distributed systems, database integrity, time handling, auth expansion, and observability in their test suites.

---

## Target Users

### Primary: Senior Engineers & Tech Leads
- Own codebase quality and architecture decisions
- Need to ensure comprehensive coverage before releases
- Want to identify blind spots in existing test suites
- Will integrate Pinata into CI/CD pipelines

### Secondary: QA Engineers
- Responsible for test strategy and coverage
- Need structured approach to edge case identification
- Want examples they can adapt to their domain
- Will use Pinata to audit and expand test plans

### Tertiary: Security Engineers
- Focus on vulnerability discovery
- Need comprehensive security test categories
- Want integration with existing security tooling
- Will use Pinata for security-focused test generation

### Enterprise Buyers: Engineering Managers & CTOs
- Need visibility into test coverage across risk domains
- Want metrics for compliance and audit
- Require reporting on coverage gaps
- Will evaluate ROI based on prevented incidents

---

## Success Metrics

### North Star Metric
**Reduce production incidents caused by untested edge cases by 50% within 6 months of adoption.**

Measured via: user-reported incident correlation with Pinata gap reports, before/after deployment tracking.

### Adoption Metrics

| Metric | Definition | Target (6mo) | Target (12mo) |
|--------|------------|--------------|---------------|
| Weekly Active Teams | Teams running analysis per week | 500 | 2,000 |
| Codebases Analyzed | Unique repos processed (cumulative) | 5,000 | 25,000 |
| D7 Retention | % returning within 7 days of first use | 40% | 50% |
| D30 Retention | % still active after 30 days | 25% | 35% |
| CI/CD Integration Rate | % of active users with pipeline integration | 30% | 50% |
| Organic Growth | % of new users from referral/word-of-mouth | 20% | 40% |

**Leading indicators:**
- Time from signup to first analysis < 5 minutes
- First actionable gap identified < 10 minutes
- First generated test committed < 30 minutes

### Quality Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| Bug Detection Rate | Bugs caught by Pinata tests / total bugs in period | 15% of all bugs |
| True Positive Rate | Valid suggestions / total suggestions | > 85% |
| False Positive Rate | Invalid suggestions / total suggestions | < 15% |
| Test Adoption Rate | Generated tests actually committed / tests generated | > 40% |
| Time to Value | Minutes from install to first actionable insight | < 10 min |
| Coverage Improvement | Avg % increase in risk domain coverage | +25% per repo |

**Quality guardrails:**
- Generated tests must compile/parse without errors: > 99%
- Generated tests must be idiomatic for target language: > 90% (human review sample)
- No secrets or PII in generated output: 100%

### Business Metrics

| Metric | Definition | Target (12mo) |
|--------|------------|---------------|
| MRR | Monthly recurring revenue | $50k |
| Trial Conversion | Free trial to paid | 8% |
| Enterprise Conversion | Trial to enterprise tier | 2% |
| Net Revenue Retention | Year-over-year revenue from existing customers | 120% |
| Expansion Rate | Avg additional seats/repos per account annually | +50% |
| Churn Rate | Monthly customer churn | < 5% |
| CAC Payback | Months to recover customer acquisition cost | < 12 |
| NPS | Net Promoter Score | > 40 |

**Revenue model assumptions:**
- Free tier: 1 repo, 100 analyses/month, community categories only
- Pro tier ($29/mo): 5 repos, unlimited analyses, all categories, CI/CD integration
- Team tier ($99/mo): 20 repos, team dashboard, baseline comparison, priority support
- Enterprise (custom): Unlimited, SSO, audit logs, SLA, on-prem option

### Operational Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| API Uptime | Availability of analysis service | 99.9% |
| P95 Analysis Time | 95th percentile analysis duration | < 60s for 1k files |
| P95 Generation Time | 95th percentile test generation | < 10s per test |
| Support Response Time | First response to support ticket | < 4 hours |
| Incident Resolution | Time to resolve P1 incidents | < 2 hours |

---

## Scope

### In Scope (v1)
- CLI tool that analyzes any codebase
- AI-powered test generation across all risk domains
- Category taxonomy with examples
- Gap analysis reporting
- Integration with major CI/CD platforms (GitHub Actions, GitLab CI, CircleCI)
- Support for: Python, JavaScript/TypeScript, Go, Java, Rust

### Out of Scope (v1)
- GUI/web interface (CLI only)
- Mobile-specific testing (iOS/Android)
- ML model adversarial testing
- Accessibility/a11y testing
- Real-time monitoring (static analysis only)
- Test execution (generation only, user runs tests)

### Future Scope (v2+)
- Web dashboard for enterprise reporting
- IDE plugins (VS Code, JetBrains)
- Custom category definitions
- Team collaboration features
- Historical trend analysis
- **AI-Assisted Security Review Agent** (see below)

### Future Scope: AI-Assisted Security Review

**Problem:** Static analysis has fundamental limitations for certain vulnerability types. Research (SecVulEval 2025, Veracode GenAI Report) confirms:

- **Auth failures, rate limiting, data exposure** require semantic understanding
- Static analysis achieves <50% detection on these categories
- Even LLMs achieve only ~23.8% F1 score for fine-grained vulnerability detection

**Current Approach (v1):**
Categories like `auth-failures`, `rate-limiting`, and `data-exposure` are implemented as **flag for manual review** patterns rather than claiming definitive detection.

**Future Feature: AI Security Review Agent**

An agentic LLM system that can:

1. **Auth Review Agent**
   - Trace middleware chains across files
   - Understand route protection patterns
   - Verify JWT/session configuration
   - Check password hashing implementation

2. **Rate Limit Review Agent** 
   - Cross-reference code with infrastructure configs (nginx, k8s, CDN)
   - Detect protection at any layer (app, gateway, WAF)
   - Map endpoint coverage

3. **Data Exposure Review Agent**
   - Build field sensitivity ontology from model names
   - Trace data flow from database to API response
   - Identify missing field filtering

**Expected Improvement:**
- Detection rate: <50% (static) → 70%+ (with agent)
- False positive rate: maintain <30%
- Review time: <5 minutes per endpoint

**Cost Estimate:**
- Per-codebase review: $0.50-2.00
- Implemented via cached, incremental reviews

---

## Feature Requirements

### F1: Core Capabilities

#### F1.1: Codebase Ingestion
The system must ingest and understand codebases to identify testable patterns.

**Requirements:**
- Parse source files into AST for supported languages (Python, TypeScript, Go, Java, Rust)
- Extract function signatures, class hierarchies, import graphs
- Identify test files vs production code (by convention: `*_test.py`, `*.spec.ts`, etc.)
- Detect frameworks and libraries in use (Django, Express, Spring, etc.)
- Handle monorepos with multiple language roots
- Respect `.gitignore` and `.pinataignore` for exclusions
- **Limit**: Max 10,000 files per analysis, max 1MB per file

**Performance targets:**
- Ingestion: 1,000 files/second on commodity hardware
- Memory: < 2GB for 10k file codebase
- Incremental: Re-analyze only changed files on subsequent runs

#### F1.2: Pattern Detection
Identify code patterns that indicate susceptibility to specific test categories.

**Requirements:**
- Rule-based detection for common patterns (regex + AST queries)
- Semantic detection for complex patterns (LLM-assisted)
- Confidence scoring for each detection (high/medium/low)
- Link detections to specific file:line locations
- Detect absence of patterns (missing timeout configs, missing auth checks)
- Framework-aware rules (Django ORM patterns differ from SQLAlchemy)

**Detection categories:**
- **Structural**: Function calls, class inheritance, decorator usage
- **Semantic**: Business logic intent, data flow paths
- **Configuration**: Missing configs, insecure defaults
- **Dependency**: Vulnerable packages, outdated versions

#### F1.3: Gap Analysis
Calculate coverage across risk domains and identify priority gaps.

**Requirements:**
- Score each risk domain: covered (tests exist), partial (some tests), gap (no tests)
- Prioritize gaps by: severity × likelihood × business impact
- Compare against baseline (previous run or main branch)
- Generate actionable recommendations ranked by priority
- Aggregate scores into single "Pinata Score" (0-100)

**Scoring algorithm:**
```
domain_score = (categories_with_tests / applicable_categories) × 100
pinata_score = weighted_average(domain_scores, weights=priority_weights)
gap_priority = severity × (1 - coverage) × detection_confidence
```

#### F1.4: Test Generation
Generate runnable test code for identified gaps.

**Requirements:**
- Generate tests in target language's idiomatic style
- Use target project's test framework (pytest, jest, go test, junit, etc.)
- Include setup/teardown scaffolding
- Generate meaningful test names and docstrings
- Produce both positive and negative test cases
- Generate mocks/stubs for external dependencies
- **Limit**: Max 50 tests per generation request

**Quality requirements:**
- Generated code must parse without syntax errors
- Generated code must follow language conventions (linting clean)
- Generated tests must be self-contained (no undefined references)
- Include comments explaining what vulnerability is tested

#### F1.5: Reporting
Output analysis results in multiple formats for different consumers.

**Requirements:**
- **Terminal**: Colored, formatted table with priority ordering
- **JSON**: Machine-readable for scripting and CI/CD
- **Markdown**: Human-readable for documentation/PRs
- **SARIF**: GitHub Security tab integration
- **JUnit XML**: CI/CD test result integration
- **HTML**: Standalone report for sharing

**Report contents:**
- Executive summary (Pinata Score, top 5 gaps, trend)
- Domain-by-domain breakdown with scores
- Detailed findings with file:line locations
- Generated tests (optional, separate files)
- Recommendations with effort estimates

### F2: CLI Interface

#### F2.1: Command Structure

```bash
pinata <command> [options]

Commands:
  analyze     Analyze codebase for test coverage gaps
  generate    Generate tests for identified gaps
  search      Search category taxonomy
  list        List all categories with filters
  init        Initialize Pinata config in project
  auth        Manage API key authentication
  config      View/edit configuration
  version     Show version info
```

#### F2.2: Analyze Command

```bash
pinata analyze [path] [options]

Options:
  --path, -p          Path to codebase (default: current directory)
  --output, -o        Output format: terminal|json|markdown|sarif|html
  --domains, -d       Filter to specific domains (comma-separated)
  --levels, -l        Filter to specific test levels
  --severity, -s      Minimum severity: critical|high|medium|low
  --baseline, -b      Compare against baseline file or branch
  --fail-on           Exit non-zero if gaps at level: critical|high|medium
  --exclude           Glob patterns to exclude
  --include           Glob patterns to include (overrides exclude)
  --max-files         Max files to analyze (default: 10000)
  --verbose, -v       Verbose output
  --quiet, -q         Suppress non-essential output
  --config, -c        Path to config file

Examples:
  pinata analyze
  pinata analyze ./backend --domains=security,data -o json
  pinata analyze --baseline=main --fail-on=critical
```

#### F2.3: Generate Command

```bash
pinata generate [options]

Options:
  --gaps              Generate tests for all identified gaps
  --category, -c      Generate tests for specific category ID
  --domain, -d        Generate tests for all categories in domain
  --output-dir        Directory for generated test files
  --framework         Target test framework (auto-detected if omitted)
  --dry-run           Show what would be generated without writing
  --max-tests         Max tests to generate (default: 50)
  --style             Code style: verbose|concise (default: concise)

Examples:
  pinata generate --gaps --output-dir=./tests/generated
  pinata generate --category=sql-injection --framework=pytest
  pinata generate --domain=security --dry-run
```

#### F2.4: Search and List Commands

```bash
pinata search <query> [options]
pinata list [options]

Options:
  --domain, -d        Filter by risk domain
  --level, -l         Filter by test level
  --language          Filter by language applicability
  --framework         Filter by framework applicability
  --priority          Filter by priority: P0|P1|P2
  --output, -o        Output format: terminal|json|markdown
  --limit             Max results (default: 20)

Examples:
  pinata search "race condition"
  pinata list --domain=security --priority=P0
  pinata list --language=python --framework=django
```

#### F2.5: Configuration

```yaml
# .pinata.yml (project config)
version: 1

# Analysis settings
analysis:
  languages: [python, typescript]
  exclude:
    - "vendor/**"
    - "node_modules/**"
    - "**/*.generated.*"
  max_files: 5000

# Domain configuration
domains:
  security:
    enabled: true
    priority: P0
  data:
    enabled: true
  platform:
    enabled: false  # Not applicable for this project

# Generation settings
generation:
  framework: pytest
  output_dir: tests/pinata
  style: concise

# CI/CD settings
ci:
  fail_on: critical
  baseline: main
  output: sarif
```

### F3: Web Interface (v2)

#### F3.1: Dashboard

**Team Overview:**
- Aggregate Pinata Score across all repos
- Trend charts (score over time)
- Top gaps across team repos
- Recent analysis runs with status

**Repository View:**
- Domain-by-domain coverage heatmap
- Gap list with priority sorting
- Historical trend for this repo
- Comparison against team average

**Gap Detail:**
- Full detection context (code snippets)
- Related CVEs and incidents
- Generated test preview
- One-click copy or PR creation

#### F3.2: Collaboration Features

- **Assignments**: Assign gaps to team members
- **Comments**: Discuss gaps and proposed solutions
- **Status tracking**: Mark gaps as: open, in-progress, resolved, won't-fix
- **Notifications**: Slack/email alerts for new critical gaps
- **Reports**: Scheduled email digests, PDF exports for compliance

#### F3.3: Enterprise Features

- **SSO**: SAML, OIDC integration
- **Audit logs**: All actions logged with user attribution
- **Role-based access**: Admin, maintainer, viewer roles
- **Custom categories**: Define org-specific test categories
- **Private category store**: Enterprise-only category packs
- **On-prem deployment**: Docker/Kubernetes deployment option

### F4: Integrations

#### F4.1: CI/CD Platforms

**GitHub Actions:**
```yaml
- uses: pinata/action@v1
  with:
    api_key: ${{ secrets.PINATA_API_KEY }}
    path: ./src
    fail_on: critical
    baseline: ${{ github.base_ref }}
    output: sarif
- uses: github/codeql-action/upload-sarif@v2
  with:
    sarif_file: pinata.sarif
```

**GitLab CI:**
```yaml
pinata:
  image: pinata/cli:latest
  script:
    - pinata analyze --fail-on=critical --output=json > report.json
  artifacts:
    reports:
      codequality: report.json
```

**CircleCI, Jenkins, Azure DevOps**: Similar patterns with platform-specific syntax.

#### F4.2: IDE Extensions (v2)

**VS Code Extension:**
- Inline gap indicators (yellow squiggles for susceptible code)
- Hover tooltip showing category and severity
- Quick action: "Generate test for this gap"
- Side panel: Gap explorer with filtering
- Status bar: Pinata Score for current file/project

**JetBrains Plugin:**
- Same capabilities as VS Code
- Integration with built-in test runner

#### F4.3: API

**REST API:**
```
POST /v1/analyze
  Body: { repo_url, branch, options }
  Response: { analysis_id, status }

GET /v1/analysis/{id}
  Response: { status, results, gaps, score }

POST /v1/generate
  Body: { analysis_id, category_ids, options }
  Response: { tests: [...] }

GET /v1/categories
  Query: ?domain=security&language=python
  Response: { categories: [...] }
```

**Webhooks:**
- `analysis.complete`: Triggered when analysis finishes
- `gap.new`: Triggered when new critical gap detected
- `score.changed`: Triggered when Pinata Score changes significantly

**SDKs:**
- Python: `pip install pinata-sdk`
- Node: `npm install @pinata/sdk`
- Go: `go get github.com/pinata/sdk-go`

---

## Requirements

### R1: Category Organization

Separate **test levels** from **risk domains** as a two-dimensional taxonomy.

**Test Levels**
| Level | Description | Scope |
|-------|-------------|-------|
| Unit | Isolated function/class | Single module |
| Integration | Module-to-module contracts | Service boundaries |
| System | Full workflow with dependencies | End-to-end |
| Chaos | Failure injection, load patterns | Infrastructure |

**Risk Domains**
| Domain | Priority | Description |
|--------|----------|-------------|
| Security & Access Control | P0 | Auth, injection, secrets, supply chain |
| Data & Persistence | P0 | Transactions, migrations, partial writes |
| Concurrency & Distribution | P0 | Race conditions, network failures, ordering |
| Input & Format Handling | P1 | Encoding, JSON, file system edge cases |
| Resource Management | P1 | Memory, FDs, disk, connection pools |
| Reliability & Operations | P1 | Shutdown, recovery, config drift |
| Algorithmic & Performance | P2 | ReDoS, complexity attacks, load patterns |
| Platform & Compatibility | P2 | Cross-platform, container, dependencies |
| Business Logic | P2 | Domain invariants, workflow bypass |
| Compliance & Privacy | P2 | PII, audit trails, data retention |

**Implementation:**
- Store taxonomy in versioned schema (categories evolve)
- Each category has: id, name, description, priority, test_level, risk_domain, examples[], detection_patterns[]
- Categories can be enabled/disabled per project type
- Custom categories supported via config

### R2: Examples Per Category

Each category must include:

**Minimum 3 examples per category** covering:
1. **Concept**: What the vulnerability/edge case is
2. **Detection**: How Pinata identifies if codebase is susceptible
3. **Test Template**: Generative test code skeleton
4. **Severity**: Impact if untested (critical/high/medium/low)

**Example structure:**
```yaml
category: transaction-isolation
domain: data-persistence
level: integration
examples:
  - name: dirty-read
    concept: "Reading uncommitted data from concurrent transaction"
    detection:
      - "Database queries without explicit isolation level"
      - "Read operations in transaction blocks without FOR UPDATE"
    test_template: |
      async def test_dirty_read_prevented():
          # Start transaction A, write uncommitted
          # Start transaction B, attempt read
          # Assert B sees consistent state
    severity: critical
    languages: [python, javascript, go, java]
```

**Requirements:**
- Examples must be language-specific where syntax differs
- Examples must be copy-paste runnable with minimal modification
- Examples link to real CVEs/incidents where applicable
- Examples include both "test this exists" and "test this fails correctly"

### R3: Searchability

Users must find relevant categories quickly.

**Search dimensions:**
- **By keyword**: "race condition", "sql injection", "timeout"
- **By risk domain**: all security categories, all data categories
- **By test level**: all unit-level tests, all chaos tests
- **By language**: categories applicable to Python projects
- **By framework**: categories for Django, Express, Spring
- **By detected patterns**: categories matching patterns found in codebase

**Implementation:**
- Full-text search across category names, descriptions, examples
- Faceted filtering by domain, level, priority, language
- "Related categories" suggestions based on current selection
- CLI flags: `pinata search "network timeout"`, `pinata list --domain=security`

**Output formats:**
- Terminal table (default)
- JSON (for scripting)
- Markdown (for documentation)

### R4: Integration Patterns

**CI/CD Integration**

```yaml
# GitHub Actions example
- name: Pinata Analysis
  uses: pinata/action@v1
  with:
    api_key: ${{ secrets.PINATA_API_KEY }}
    fail_on: critical  # fail build if critical gaps found
    report: coverage-report.json
```

**Requirements:**
- Exit codes: 0 (pass), 1 (critical gaps), 2 (high gaps), 3 (error)
- Output formats: JSON, JUnit XML, SARIF (for GitHub Security tab)
- Incremental analysis: only scan changed files on PR
- Baseline support: compare against main branch coverage
- Cache support: don't re-analyze unchanged code

**IDE Integration (v2)**
- VS Code extension showing category gaps inline
- "Generate test for this category" code action
- Real-time gap highlighting as code changes

**API Integration**
- REST API for programmatic access
- Webhook notifications for coverage changes
- SDK for custom integrations (Python, Node, Go)

---

## Gap-Specific Requirements

### G1: Network & Distributed Systems

**Problem**: Teams test happy-path API calls but miss failure modes.

**Categories to implement:**
- Network partition handling
- Timeout and retry behavior
- Thundering herd / retry storms
- Clock skew and ordering
- Idempotency violations
- Eventually consistent reads
- Service discovery failures
- DNS resolution failures

**Detection patterns:**
- HTTP client usage without timeout configuration
- Retry logic without exponential backoff
- Distributed transactions without saga/compensation
- Timestamp comparisons across services
- Missing idempotency keys on mutating endpoints

**Test generation approach:**
- Inject network delays via mock/stub
- Simulate partial failures (some nodes up, some down)
- Test with out-of-order message delivery
- Verify idempotency by replaying requests
- Test behavior when downstream services return 5xx

**Example output:**
```python
# Generated: Network Partition Test
async def test_handles_downstream_timeout():
    """Verify graceful degradation when payment service times out"""
    with mock_timeout("payment-service", delay_ms=30000):
        response = await checkout_handler(order)
        assert response.status == "pending"
        assert response.retry_after is not None
```

### G2: Database & Transactional Integrity

**Problem**: Teams trust ORMs but miss isolation and migration edge cases.

**Categories to implement:**
- Transaction isolation violations (dirty/phantom/non-repeatable reads)
- Schema migration rollbacks
- Deadlock detection and recovery
- Partial write recovery
- Pagination under concurrent mutation
- Connection pool exhaustion
- Query timeout handling

**Detection patterns:**
- ORM usage without explicit transaction boundaries
- Migrations without down() methods
- SELECT without FOR UPDATE in read-modify-write
- Pagination with OFFSET (breaks under mutation)
- No connection pool size limits

**Test generation approach:**
- Concurrent transaction tests with controlled interleaving
- Migration up/down/up cycle verification
- Inject deadlock conditions via lock ordering
- Kill connection mid-transaction, verify recovery
- Paginate while inserting/deleting records

**Example output:**
```python
# Generated: Phantom Read Test
async def test_no_phantom_reads():
    """Verify count queries see consistent snapshot"""
    async with transaction(isolation="SERIALIZABLE"):
        count_before = await Order.count()
        # Concurrent insert happens here (injected)
        count_after = await Order.count()
        assert count_before == count_after
```

### G3: Time Handling

**Problem**: Time logic works until DST, leap seconds, or timezones appear.

**Categories to implement:**
- DST transition handling
- Leap second behavior
- Timezone boundary logic
- Year 2038 (32-bit timestamp overflow)
- TTL/expiration edge cases
- Cron schedule boundaries
- Clock drift between services

**Detection patterns:**
- datetime.now() without timezone
- Hardcoded timezone assumptions
- Timestamp arithmetic without library support
- Cron expressions with DST-sensitive hours (2am)
- TTL logic using system clock directly

**Test generation approach:**
- Freeze time at DST boundaries (2am spring forward, 2am fall back)
- Test with leap second timestamps
- Verify behavior at epoch overflow (2038-01-19)
- Test expiration logic at exact boundary
- Mock system clock with drift

**Example output:**
```python
# Generated: DST Transition Test
@freeze_time("2024-03-10 01:59:59", tz="America/New_York")
def test_handles_dst_spring_forward():
    """Verify scheduling logic handles missing 2am hour"""
    task = schedule_for("02:30:00")
    # 2:30am doesn't exist on this day
    assert task.scheduled_time == "03:30:00"
```

### G4: Authentication & Authorization

**Problem**: Auth tests check "login works" but miss escalation and edge cases.

**Categories to implement:**
- Session fixation
- Token expiration and refresh races
- Privilege escalation (horizontal and vertical)
- IDOR (insecure direct object reference)
- CSRF token validation
- Rate limiting bypass
- Account lockout circumvention
- Multi-tenancy data isolation
- JWT algorithm confusion
- OAuth state parameter validation

**Detection patterns:**
- Session ID unchanged after login
- Token refresh without old token invalidation
- Authorization checks missing on endpoints
- User ID from URL/body without ownership check
- Rate limit by IP only (bypassable via headers)
- Tenant ID from user input without validation

**Test generation approach:**
- Attempt actions with expired/revoked tokens
- Access resource as user A with user B's ID
- Replay requests with manipulated tenant context
- Bypass rate limits via X-Forwarded-For
- Test JWT with alg:none and key confusion

**Example output:**
```python
# Generated: Horizontal Privilege Escalation Test
async def test_cannot_access_other_users_data():
    """Verify user A cannot access user B's resources"""
    user_a_token = await login("user_a")
    user_b_resource = "/api/users/user_b/settings"
    
    response = await client.get(
        user_b_resource, 
        headers={"Authorization": f"Bearer {user_a_token}"}
    )
    assert response.status_code == 403
```

### G5: Observability & Operations

**Problem**: Systems work until logging fails or configs drift.

**Categories to implement:**
- Logging under failure (disk full, rotation, circular objects)
- Graceful shutdown behavior
- Health check partial failures
- Configuration drift detection
- Feature flag edge cases
- Dependency version mismatches
- Startup ordering dependencies
- Circuit breaker behavior

**Detection patterns:**
- Logging without error handling
- SIGTERM handler missing or incomplete
- Health endpoint returns 200 without checking dependencies
- Config loaded once at startup without refresh
- Feature flags without default fallback
- No dependency version pinning

**Test generation approach:**
- Fill disk, verify logging doesn't crash app
- Send SIGTERM during active request, verify completion
- Fail one dependency, verify health reports partial
- Change config, verify hot reload or restart detection
- Test feature flag with missing/corrupt backend

**Example output:**
```python
# Generated: Graceful Shutdown Test
async def test_graceful_shutdown_completes_requests():
    """Verify in-flight requests complete on SIGTERM"""
    # Start long-running request
    request_task = asyncio.create_task(slow_endpoint())
    
    # Send SIGTERM
    os.kill(os.getpid(), signal.SIGTERM)
    
    # Request should complete, not abort
    response = await request_task
    assert response.status_code == 200
```

---

## Technical Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              User Layer                                  │
│  ┌─────────┐  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │   CLI   │  │  Web App    │  │ IDE Plugins  │  │  CI/CD Actions    │  │
│  └────┬────┘  └──────┬──────┘  └──────┬───────┘  └─────────┬─────────┘  │
└───────┼──────────────┼────────────────┼────────────────────┼────────────┘
        │              │                │                    │
        └──────────────┴────────────────┴────────────────────┘
                                  │
                          ┌───────▼───────┐
                          │   API Gateway  │
                          │  (Auth, Rate   │
                          │   Limiting)    │
                          └───────┬───────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────────┐
│                           Core Engine                                    │
│                                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────┐   │
│  │  Ingestion   │    │   Analysis   │    │    Test Generation       │   │
│  │              │    │              │    │                          │   │
│  │ • File scan  │───▶│ • Pattern    │───▶│ • Template rendering     │   │
│  │ • AST parse  │    │   matching   │    │ • LLM augmentation       │   │
│  │ • Dep graph  │    │ • Gap calc   │    │ • Code validation        │   │
│  │ • Framework  │    │ • Scoring    │    │ • Formatting             │   │
│  │   detection  │    │ • Baseline   │    │                          │   │
│  └──────────────┘    └──────────────┘    └──────────────────────────┘   │
│         │                   │                        │                   │
│         └───────────────────┼────────────────────────┘                   │
│                             │                                            │
│                    ┌────────▼────────┐                                   │
│                    │  Result Cache   │                                   │
│                    │  (Redis/SQLite) │                                   │
│                    └─────────────────┘                                   │
└─────────────────────────────┬───────────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────────────┐
│                         Data Layer                                       │
│                                                                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐   │
│  │  Category Store  │  │  Analysis Store  │  │   User/Org Store     │   │
│  │                  │  │                  │  │                      │   │
│  │ • Taxonomy       │  │ • Run history    │  │ • API keys           │   │
│  │ • Patterns       │  │ • Gap snapshots  │  │ • Config             │   │
│  │ • Templates      │  │ • Baselines      │  │ • Team membership    │   │
│  │ • Examples       │  │ • Trends         │  │ • Billing            │   │
│  └──────────────────┘  └──────────────────┘  └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
1. INGEST
   Input: Path to codebase
   Process:
     - Walk directory tree respecting ignore patterns
     - Parse files into AST per language
     - Build import/dependency graph
     - Detect frameworks from config files
   Output: CodebaseModel { files[], dependencies[], frameworks[] }

2. DETECT
   Input: CodebaseModel, CategoryStore
   Process:
     - For each category, run detection patterns against AST
     - Score confidence (high/medium/low)
     - Record file:line locations
   Output: DetectionResults { category_id, detections[], confidence }

3. SCORE
   Input: DetectionResults, existing tests
   Process:
     - Match detections to existing test coverage
     - Calculate domain scores
     - Compare against baseline if provided
     - Compute aggregate Pinata Score
   Output: GapAnalysis { domains[], gaps[], score, delta }

4. GENERATE
   Input: GapAnalysis, priority filters
   Process:
     - Select top priority gaps
     - Render test templates with codebase context
     - Augment with LLM for complex cases
     - Validate generated code parses
     - Format to project conventions
   Output: GeneratedTests { tests[], metadata }

5. REPORT
   Input: GapAnalysis, GeneratedTests, output format
   Process:
     - Format for target output (terminal/json/sarif/html)
     - Apply severity coloring for terminal
     - Write generated test files if requested
   Output: Report file or stdout
```

### Data Model

#### Category Schema

```typescript
interface Category {
  id: string;                    // "sql-injection"
  version: number;               // Schema version for migrations
  name: string;                  // "SQL Injection"
  description: string;           // Detailed explanation
  
  // Classification
  domain: RiskDomain;            // "security"
  level: TestLevel;              // "integration"
  priority: "P0" | "P1" | "P2";
  severity: "critical" | "high" | "medium" | "low";
  
  // Detection
  detection_patterns: DetectionPattern[];
  applicable_languages: Language[];
  applicable_frameworks: Framework[];
  
  // Generation
  test_templates: TestTemplate[];
  examples: Example[];
  
  // Metadata
  cves: string[];                // Related CVEs
  references: string[];          // External links
  created_at: Date;
  updated_at: Date;
}

interface DetectionPattern {
  id: string;
  type: "ast" | "regex" | "semantic";
  language: Language;
  pattern: string;               // AST query or regex
  confidence: "high" | "medium" | "low";
  description: string;           // What this pattern catches
}

interface TestTemplate {
  id: string;
  language: Language;
  framework: TestFramework;
  template: string;              // Mustache/Jinja template
  variables: TemplateVariable[];
}

interface Example {
  name: string;
  concept: string;
  vulnerable_code: string;
  test_code: string;
  severity: string;
}
```

#### Analysis Schema

```typescript
interface AnalysisRun {
  id: string;
  repo_id: string;
  branch: string;
  commit_sha: string;
  
  // Configuration
  config: AnalysisConfig;
  
  // Results
  status: "pending" | "running" | "complete" | "failed";
  started_at: Date;
  completed_at: Date;
  duration_ms: number;
  
  // Metrics
  files_analyzed: number;
  categories_checked: number;
  gaps_found: number;
  pinata_score: number;
  
  // Details
  domain_scores: DomainScore[];
  gaps: Gap[];
  
  // Comparison
  baseline_id?: string;
  delta?: ScoreDelta;
}

interface Gap {
  id: string;
  category_id: string;
  severity: string;
  confidence: string;
  
  // Location
  file: string;
  line_start: number;
  line_end: number;
  code_snippet: string;
  
  // Context
  detection_pattern_id: string;
  message: string;
  recommendation: string;
  
  // Status (for web UI)
  status: "open" | "in_progress" | "resolved" | "wont_fix";
  assigned_to?: string;
}
```

### Extensibility

#### Custom Categories

Users can define org-specific categories via YAML:

```yaml
# .pinata/categories/internal-api-versioning.yml
id: internal-api-versioning
name: Internal API Version Mismatch
domain: data
level: integration
priority: P1
severity: high

description: |
  Detect calls to internal APIs without explicit version headers.
  Our microservices require X-API-Version header for all internal calls.

detection_patterns:
  - type: ast
    language: python
    pattern: |
      call(func=attribute(value=name("requests"), attr="get|post|put|delete"))
      where not contains(args, "X-API-Version")
    confidence: high

test_templates:
  - language: python
    framework: pytest
    template: |
      def test_{{function_name}}_includes_version_header():
          """Verify internal API call includes version header"""
          with patch("requests.{{method}}") as mock:
              {{function_call}}
              assert "X-API-Version" in mock.call_args.kwargs.get("headers", {})

examples:
  - name: missing-version-header
    concept: Internal API call without version negotiation
    vulnerable_code: |
      response = requests.get(f"{INTERNAL_API}/users/{id}")
    test_code: |
      def test_get_user_includes_version():
          with patch("requests.get") as mock:
              get_user(123)
              headers = mock.call_args.kwargs.get("headers", {})
              assert "X-API-Version" in headers
```

#### Plugin Architecture

```typescript
interface PinataPlugin {
  name: string;
  version: string;
  
  // Lifecycle hooks
  onInit?(ctx: PluginContext): Promise<void>;
  onAnalyzeStart?(ctx: AnalysisContext): Promise<void>;
  onAnalyzeComplete?(ctx: AnalysisContext, results: AnalysisResults): Promise<void>;
  
  // Extension points
  detectors?: Detector[];           // Custom detection patterns
  generators?: Generator[];         // Custom test generators
  formatters?: Formatter[];         // Custom output formats
  reporters?: Reporter[];           // Custom report destinations
}

// Example: Slack notification plugin
const slackPlugin: PinataPlugin = {
  name: "pinata-slack",
  version: "1.0.0",
  
  async onAnalyzeComplete(ctx, results) {
    if (results.gaps.some(g => g.severity === "critical")) {
      await postToSlack(ctx.config.slackWebhook, {
        text: `🚨 Pinata found ${results.gaps.length} gaps in ${ctx.repo}`,
        attachments: formatGapsForSlack(results.gaps)
      });
    }
  }
};
```

#### Language Support Extensions

Adding a new language requires:

```typescript
interface LanguageSupport {
  id: Language;
  name: string;
  extensions: string[];           // [".py", ".pyw"]
  
  // Parsing
  parser: Parser;                 // Tree-sitter or custom AST parser
  queryLanguage: string;          // Tree-sitter query syntax or custom
  
  // Framework detection
  frameworkDetectors: FrameworkDetector[];
  
  // Test generation
  testFrameworks: TestFrameworkSupport[];
  
  // Code style
  formatter?: Formatter;
  linter?: Linter;
}

interface TestFrameworkSupport {
  id: TestFramework;
  name: string;
  detectPattern: string;          // How to detect if project uses this
  importStatement: string;
  testFunction: string;           // Template for test function
  assertionStyle: string;
  setupTeardown: string;
}
```

### API Key & Cost Management

Per user rule [[memory:9392184]]:

**LIMIT EVERYTHING:**
- Max files per analysis: 10,000 (configurable down)
- Max file size: 1MB (skip larger files with warning)
- Max tokens per LLM request: 4,096
- Max tests per generation: 50
- Rate limits: 100 analyses/hour free, 1000/hour pro

**SHOW THE MATH:**
```
Analysis cost estimate (logged before execution):
  Files: 500
  Avg tokens/file: 200
  Total input tokens: 100,000
  
  Pattern matching: free (local)
  LLM generation (if requested):
    Tests requested: 10
    Avg tokens/test: 500
    Total generation tokens: 5,000
    
  Estimated cost: $0.12 (input) + $0.03 (output) = $0.15
```

**PREVENT LOOPS:**
- Cache analysis results by (repo, commit, config) hash
- Cache generated tests by (category, code_context) hash
- Deduplicate detection results
- Circuit breaker: abort if > 1000 detections in single file

### Security Considerations

Per user rule [[memory:8614801]]:

**Secrets Management:**
- API keys stored in OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service)
- Never written to config files, logs, or generated output
- Masked in all terminal output: `API key: sk-...XXXX`

**Generated Code Safety:**
- Scan generated tests for secrets/credentials before output
- No execution of generated code (generation only)
- Sandboxed parsing (no eval, no dynamic imports)

**Data Privacy:**
- Code never leaves user machine for pattern matching (local)
- Only code snippets sent to LLM for generation (with consent)
- Enterprise: option to use on-prem LLM
- No telemetry without explicit opt-in
- GDPR-compliant data handling

**Supply Chain:**
- Pin all dependencies with checksums
- Minimal dependency tree
- Regular vulnerability scanning
- Signed releases

---

## Constraints

### Performance Targets

| Operation | Target | Max Acceptable |
|-----------|--------|----------------|
| CLI startup | < 200ms | 500ms |
| Analysis (100 files) | < 5s | 15s |
| Analysis (1,000 files) | < 30s | 60s |
| Analysis (10,000 files) | < 5min | 10min |
| Pattern detection per file | < 50ms | 100ms |
| Test generation per test | < 5s | 10s |
| Memory (1k files) | < 500MB | 1GB |
| Memory (10k files) | < 2GB | 4GB |

**Incremental analysis:**
- Unchanged files: 0ms (cached)
- Changed files only: proportional to change size
- Cache invalidation: on config change or category update

### Compatibility Requirements

**Operating Systems:**
- macOS 12+ (arm64, x86_64)
- Ubuntu 20.04+ (x86_64)
- Debian 11+
- Windows 10+ (x86_64)
- Docker (linux/amd64, linux/arm64)

**Language Runtimes (for analysis):**
- Python 3.8+
- Node.js 18+
- Go 1.20+
- Java 11+
- Rust 1.70+

**CI/CD Platforms:**
- GitHub Actions
- GitLab CI
- CircleCI
- Jenkins
- Azure DevOps
- Bitbucket Pipelines

**IDEs (v2):**
- VS Code 1.80+
- JetBrains IDEs 2023.1+

### Scalability Requirements

**Single analysis:**
- 10,000 files max per run
- 100 categories evaluated
- 1,000 gaps max reported (truncate with warning)

**Enterprise (per org):**
- 1,000 repos
- 100,000 analyses/month
- 10,000 users

**API:**
- 1,000 requests/second sustained
- 99.9% uptime SLA
- < 100ms p95 latency for reads
- < 5s p95 latency for analysis initiation

### Reliability Requirements

**Availability:**
- API: 99.9% uptime (< 8.76 hours downtime/year)
- CLI: offline-capable for local analysis
- Graceful degradation if LLM unavailable (pattern matching still works)

**Data Durability:**
- Analysis results: 99.99% durability
- Category store: 99.999% durability
- User data: encrypted at rest, backed up daily

**Failure Modes:**
- Network failure: cache results locally, retry on reconnect
- LLM timeout: fall back to template-only generation
- Parse error: skip file with warning, continue analysis
- OOM: abort gracefully with partial results

### Security Requirements

- SOC 2 Type II compliance (enterprise tier)
- No code storage without explicit consent
- Encryption in transit (TLS 1.3)
- Encryption at rest (AES-256)
- Regular penetration testing
- Bug bounty program

---

## Timeline & Milestones

### MVP Definition (Week 8 Deliverable)

**Core Value Proposition:**
A CLI tool that analyzes any Python or TypeScript codebase and identifies gaps in test coverage across security, data integrity, and concurrency domains, with actionable recommendations.

**MVP Features:**
- `pinata analyze` command with terminal and JSON output
- `pinata search` and `pinata list` for category exploration
- 30 categories across P0 domains (security, data, concurrency)
- Pattern detection for Python and TypeScript
- Gap scoring with Pinata Score
- Basic CI/CD integration (GitHub Actions)

**MVP Non-Features (deferred):**
- Test generation (recommend only, don't generate)
- Web interface
- Go/Java/Rust support
- IDE plugins
- Baseline comparison
- Custom categories

**MVP Success Criteria:**
- Analyze 1,000 file codebase in < 60s
- Identify at least 1 valid gap in 80% of test runs against real codebases
- False positive rate < 20%
- 100 beta users providing feedback

---

### Phase 1: Foundation (Weeks 1-4)

**Goal:** Working CLI that can parse code and detect patterns.

**Week 1-2: Project Setup**
- Repository structure, CI/CD, testing infrastructure
- CLI framework (Rust with clap or Python with typer)
- Configuration file parsing (.pinata.yml)
- Basic logging and error handling

**Week 3: Ingestion Engine**
- File system walker with ignore patterns
- Python AST parsing (tree-sitter)
- TypeScript AST parsing (tree-sitter)
- Framework detection (Django, FastAPI, Express, Next.js)

**Week 4: Category Store**
- Category schema implementation
- Initial 15 categories (P0 security)
- YAML-based category definitions
- Category search and filtering

**Deliverables:**
- `pinata init` creates config file
- `pinata list --domain=security` shows categories
- `pinata search "injection"` finds relevant categories

---

### Phase 2: Detection (Weeks 5-6)

**Goal:** Pattern matching that identifies gaps.

**Week 5: Pattern Engine**
- AST query language implementation
- Regex pattern matching
- Confidence scoring
- Location tracking (file:line)

**Week 6: Gap Analysis**
- Test file identification
- Coverage calculation per category
- Pinata Score algorithm
- Gap prioritization

**Deliverables:**
- `pinata analyze` runs full analysis
- Terminal output with colored severity
- JSON output for scripting
- Exit codes for CI/CD

---

### Phase 3: MVP Polish (Weeks 7-8)

**Goal:** Production-ready MVP for beta users.

**Week 7: Categories & Quality**
- Expand to 30 categories (security, data, concurrency)
- Tune detection patterns against real codebases
- Reduce false positives
- Improve error messages

**Week 8: Integration & Launch**
- GitHub Actions workflow
- Installation scripts (brew, pip, npm)
- Documentation site
- Beta user onboarding

**Deliverables:**
- Public beta release
- Documentation with getting started guide
- GitHub Action in marketplace
- Feedback collection mechanism

---

### Phase 4: Generation (Weeks 9-12)

**Goal:** AI-powered test generation.

**Week 9-10: Template System**
- Test template schema
- Template rendering engine
- Language-specific formatters
- Test framework detection (pytest, jest, etc.)

**Week 11-12: LLM Integration**
- LLM API integration (Claude/GPT)
- Context preparation (code snippets, category info)
- Output validation (parse check, lint)
- Cost estimation and limits

**Deliverables:**
- `pinata generate` command
- Generated tests for top 20 categories
- Dry-run mode for preview
- Cost display before generation

---

### Phase 5: Scale (Weeks 13-16)

**Goal:** Handle large codebases and add languages.

**Week 13-14: Performance**
- Incremental analysis (changed files only)
- Result caching (Redis/SQLite)
- Parallel file processing
- Memory optimization

**Week 15-16: Language Expansion**
- Go support
- Java support
- Rust support (basic)
- Framework packs (Django, Spring, Express)

**Deliverables:**
- 10k file codebase in < 5 minutes
- 5 language support
- Incremental CI/CD mode

---

### Phase 6: Enterprise (Weeks 17-24)

**Goal:** Team features and enterprise readiness.

**Week 17-18: Baseline & Comparison**
- Baseline storage per branch
- Delta calculation
- Trend tracking
- Regression alerts

**Week 19-20: Web Dashboard (v1)**
- Next.js dashboard application
- Team overview page
- Repo detail page
- Gap management UI

**Week 21-22: Team Features**
- User authentication
- Team/org management
- Gap assignments
- Slack/email notifications

**Week 23-24: Enterprise**
- SSO integration (SAML/OIDC)
- Audit logging
- Role-based access control
- SARIF output for GitHub Advanced Security

**Deliverables:**
- Web dashboard (basic)
- Team tier launch
- Enterprise pilot customers

---

### Phase 7: Platform (Weeks 25-32)

**Goal:** Full platform with integrations.

**Week 25-28: IDE Plugins**
- VS Code extension
- JetBrains plugin
- Real-time gap indicators
- Quick fix actions

**Week 29-32: Extensibility**
- Custom category support
- Plugin architecture
- Public API
- Partner integrations

**Deliverables:**
- IDE plugins in marketplaces
- Developer API documentation
- Plugin SDK

---

### Milestone Summary

| Milestone | Week | Key Deliverable |
|-----------|------|-----------------|
| **M1: CLI Alpha** | 4 | Parse + search categories |
| **M2: Detection Alpha** | 6 | Gap analysis working |
| **M3: MVP Beta** | 8 | Public beta, 30 categories |
| **M4: Generation** | 12 | AI test generation |
| **M5: Scale** | 16 | 5 languages, 10k files |
| **M6: Teams** | 24 | Web dashboard, team tier |
| **M7: Platform** | 32 | IDE plugins, API, extensibility |

---

### Risk Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| LLM costs exceed budget | High | Medium | Aggressive caching, local-first patterns |
| False positive rate too high | High | Medium | Extensive testing on real codebases, tuning phase |
| Parse failures on edge cases | Medium | High | Graceful degradation, skip-and-warn |
| Slow adoption | High | Medium | Focus on immediate value, reduce time-to-insight |
| Competition from GitHub/GitLab | High | Low | Differentiate on depth and intelligence |
| Security vulnerability in tool | Critical | Low | Regular audits, minimal attack surface |

---

## Open Questions

1. **Test execution scope**: Should Pinata run generated tests or only generate them?
   - Recommendation: Generate only in v1; execution adds complexity and liability

2. **Language priority**: Which languages first?
   - Recommendation: Python + TypeScript (highest adoption), then Go/Java

3. **Pricing model**: Per-seat, per-repo, or usage-based?
   - Recommendation: Usage-based (tokens analyzed) with team tier for unlimited

4. **Self-hosted option**: Enterprise demand for on-prem?
   - Recommendation: Cloud-first, self-hosted in v2 based on demand

5. **Framework-specific categories**: How deep into Django/Rails/Spring?
   - Recommendation: Core categories framework-agnostic; framework packs as add-ons
