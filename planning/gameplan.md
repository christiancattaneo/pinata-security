# Pinata Gameplan

## Overview

Five-phase implementation plan for Pinata, a comprehensive test coverage analysis and generation tool.

**Total Timeline:** 20 weeks
**Team Size Assumption:** 1-2 engineers

```
Phase 1: Taxonomy Engine     ████████░░░░░░░░░░░░  Weeks 1-4
Phase 2: Test Templates      ░░░░░░░░████████░░░░  Weeks 5-8
Phase 3: CLI Scanner         ░░░░░░░░░░░░████░░░░  Weeks 9-12
Phase 4: Framework Integration ░░░░░░░░░░░░░░████  Weeks 13-16
Phase 5: Dashboard           ░░░░░░░░░░░░░░░░████  Weeks 17-20
```

---

## Phase 1: Core Taxonomy Engine

**Goal:** Build the foundational category system that powers all analysis.

**Duration:** 4 weeks

### Week 1: Schema Design & Data Model

| Task | Description | Est | Dependencies |
|------|-------------|-----|--------------|
| 1.1.1 | Design category schema (id, name, domain, level, severity) | 4h | None |
| 1.1.2 | Design detection pattern schema (type, language, pattern, confidence) | 4h | 1.1.1 |
| 1.1.3 | Design test template schema (language, framework, template vars) | 4h | 1.1.1 |
| 1.1.4 | Design example schema (concept, vulnerable code, test code) | 2h | 1.1.1 |
| 1.1.5 | Choose storage format (YAML files vs SQLite vs JSON) | 2h | 1.1.1-4 |
| 1.1.6 | Implement schema validation with JSON Schema or Zod | 4h | 1.1.5 |
| 1.1.7 | Create category loader with validation | 4h | 1.1.6 |

**Deliverable:** TypeScript/Python types and validation for all schemas

### Week 2: Category Store Implementation

| Task | Description | Est | Dependencies |
|------|-------------|-----|--------------|
| 1.2.1 | Implement CategoryStore class with CRUD operations | 6h | 1.1.7 |
| 1.2.2 | Implement category indexing by domain, level, language | 4h | 1.2.1 |
| 1.2.3 | Implement full-text search across categories | 4h | 1.2.1 |
| 1.2.4 | Implement category versioning (for future updates) | 4h | 1.2.1 |
| 1.2.5 | Add category validation on load (no duplicates, valid refs) | 4h | 1.2.1 |
| 1.2.6 | Write unit tests for CategoryStore | 4h | 1.2.1-5 |

**Deliverable:** Working CategoryStore with search and filtering

### Week 3: P0 Category Definitions

| Task | Description | Est | Dependencies |
|------|-------------|-----|--------------|
| 1.3.1 | Define Security domain categories (10 categories) | 8h | 1.2.1 |
| 1.3.2 | Define Data & Persistence domain categories (8 categories) | 6h | 1.2.1 |
| 1.3.3 | Define Concurrency & Distribution domain categories (6 categories) | 6h | 1.2.1 |
| 1.3.4 | Write detection patterns for each category (Python) | 8h | 1.3.1-3 |
| 1.3.5 | Write detection patterns for each category (TypeScript) | 8h | 1.3.1-3 |

**P0 Categories to define:**

```
Security (10):
  - sql-injection
  - command-injection
  - path-traversal
  - xss-stored
  - xss-reflected
  - csrf-missing
  - auth-bypass
  - privilege-escalation
  - secrets-in-code
  - insecure-deserialization

Data & Persistence (8):
  - race-condition-db
  - transaction-isolation
  - migration-rollback
  - partial-write
  - connection-pool-exhaustion
  - query-timeout
  - pagination-mutation
  - deadlock

Concurrency & Distribution (6):
  - race-condition-memory
  - timeout-missing
  - retry-storm
  - idempotency-missing
  - clock-skew
  - network-partition
```

**Deliverable:** 24 P0 categories with detection patterns for Python and TypeScript

### Week 4: P1 Categories & Testing

| Task | Description | Est | Dependencies |
|------|-------------|-----|--------------|
| 1.4.1 | Define Input & Format domain categories (6 categories) | 6h | 1.2.1 |
| 1.4.2 | Define Resource Management domain categories (4 categories) | 4h | 1.2.1 |
| 1.4.3 | Define Reliability & Operations domain categories (6 categories) | 6h | 1.2.1 |
| 1.4.4 | Write detection patterns for P1 categories | 8h | 1.4.1-3 |
| 1.4.5 | Integration tests: load all categories, verify no errors | 4h | 1.3, 1.4.1-4 |
| 1.4.6 | Documentation: category contribution guide | 4h | All |

**Deliverable:** 40 total categories, all validated and documented

### Phase 1 Output

```
src/
  taxonomy/
    schema/
      category.ts        # Category type definitions
      pattern.ts         # Detection pattern types
      template.ts        # Test template types
    store/
      category-store.ts  # CRUD, search, filtering
      loader.ts          # YAML parsing and validation
      index.ts           # Search indexing
    categories/
      security/
        sql-injection.yml
        command-injection.yml
        ...
      data/
        race-condition-db.yml
        transaction-isolation.yml
        ...
      concurrency/
        ...
      input/
        ...
      resource/
        ...
      reliability/
        ...
```

---

## Phase 2: Test Generation Templates

**Goal:** Create templates that generate runnable tests for each category.

**Duration:** 4 weeks

**Dependencies:** Phase 1 complete

### Week 5: Template Engine

| Task | Description | Est | Dependencies |
|------|-------------|-----|--------------|
| 2.1.1 | Choose template engine (Handlebars, Mustache, Jinja) | 2h | None |
| 2.1.2 | Implement template renderer with variable substitution | 6h | 2.1.1 |
| 2.1.3 | Implement language-specific formatters (indentation, style) | 6h | 2.1.2 |
| 2.1.4 | Implement template variable extraction from code context | 8h | 2.1.2 |
| 2.1.5 | Add template validation (syntax check, required vars) | 4h | 2.1.2 |
| 2.1.6 | Unit tests for template engine | 4h | 2.1.2-5 |

**Template variable types:**
```typescript
interface TemplateContext {
  // From detection
  function_name: string;
  class_name: string;
  file_path: string;
  line_number: number;
  code_snippet: string;
  
  // From framework detection
  test_framework: string;  // pytest, jest, go test
  import_style: string;    // ES modules, CommonJS, etc
  
  // From category
  category_name: string;
  vulnerability_description: string;
  
  // User config
  project_name: string;
  test_directory: string;
}
```

**Deliverable:** Working template engine with context extraction

### Week 6: Python Templates (pytest)

| Task | Description | Est | Dependencies |
|------|-------------|-----|--------------|
| 2.2.1 | Create pytest template scaffolding (imports, fixtures) | 4h | 2.1.2 |
| 2.2.2 | Write templates for Security categories (10) | 8h | 2.2.1 |
| 2.2.3 | Write templates for Data categories (8) | 6h | 2.2.1 |
| 2.2.4 | Write templates for Concurrency categories (6) | 6h | 2.2.1 |
| 2.2.5 | Write templates for P1 categories (16) | 8h | 2.2.1 |
| 2.2.6 | Validate all templates compile and run | 4h | 2.2.2-5 |

**Example template (sql-injection.yml):**
```yaml
templates:
  - language: python
    framework: pytest
    template: |
      import pytest
      from unittest.mock import patch, MagicMock
      
      class Test{{class_name}}SQLInjection:
          """SQL injection tests for {{function_name}}"""
          
          @pytest.mark.parametrize("malicious_input", [
              "'; DROP TABLE users; --",
              "1 OR 1=1",
              "1; SELECT * FROM passwords",
              "' UNION SELECT * FROM users --",
          ])
          def test_{{function_name}}_rejects_sql_injection(self, malicious_input):
              """Verify {{function_name}} sanitizes SQL injection attempts"""
              # Arrange
              {{setup_code}}
              
              # Act & Assert
              with pytest.raises((ValueError, SecurityError)):
                  {{function_call}}(malicious_input)
          
          def test_{{function_name}}_uses_parameterized_queries(self):
              """Verify {{function_name}} uses parameterized queries"""
              with patch('{{module}}.cursor') as mock_cursor:
                  {{function_call}}("safe_value")
                  
                  # Should use execute with params, not string formatting
                  call_args = mock_cursor.execute.call_args
                  assert '%s' in call_args[0][0] or '?' in call_args[0][0]
```

**Deliverable:** 40 pytest templates covering all categories

### Week 7: TypeScript Templates (Jest)

| Task | Description | Est | Dependencies |
|------|-------------|-----|--------------|
| 2.3.1 | Create Jest template scaffolding (imports, mocks) | 4h | 2.1.2 |
| 2.3.2 | Write templates for Security categories (10) | 8h | 2.3.1 |
| 2.3.3 | Write templates for Data categories (8) | 6h | 2.3.1 |
| 2.3.4 | Write templates for Concurrency categories (6) | 6h | 2.3.1 |
| 2.3.5 | Write templates for P1 categories (16) | 8h | 2.3.1 |
| 2.3.6 | Validate all templates compile and run | 4h | 2.3.2-5 |

**Deliverable:** 40 Jest templates covering all categories

### Week 8: LLM Augmentation

| Task | Description | Est | Dependencies |
|------|-------------|-----|--------------|
| 2.4.1 | Design LLM prompt for test enhancement | 4h | 2.2, 2.3 |
| 2.4.2 | Implement LLM client (Claude API) | 4h | None |
| 2.4.3 | Implement context preparation (code snippet extraction) | 6h | 2.4.1 |
| 2.4.4 | Implement output validation (parse check, lint) | 6h | 2.4.2 |
| 2.4.5 | Implement caching to avoid redundant LLM calls | 4h | 2.4.2 |
| 2.4.6 | Implement cost estimation and limits | 4h | 2.4.2 |
| 2.4.7 | Fallback to template-only when LLM unavailable | 4h | 2.4.2 |

**LLM prompt structure:**
```
You are generating a security test for a {{language}} codebase.

Category: {{category_name}}
Vulnerability: {{vulnerability_description}}

Target code:
```{{language}}
{{code_snippet}}
```

Existing test template:
```{{language}}
{{template_output}}
```

Enhance this test to:
1. Use the actual function names and imports from the target code
2. Add edge cases specific to how this code handles input
3. Include meaningful assertion messages
4. Follow {{test_framework}} best practices

Output only the enhanced test code, no explanation.
```

**Deliverable:** LLM-enhanced test generation with fallback

### Phase 2 Output

```
src/
  generation/
    engine/
      template-engine.ts    # Core template rendering
      formatter.ts          # Language-specific formatting
      context.ts            # Variable extraction
    templates/
      python/
        pytest/
          security.yml
          data.yml
          concurrency.yml
          ...
      typescript/
        jest/
          security.yml
          data.yml
          ...
    llm/
      client.ts             # Claude API client
      prompt.ts             # Prompt construction
      cache.ts              # Response caching
      validator.ts          # Output validation
```

---

## Phase 3: CLI Scanner

**Goal:** Build the CLI that scans projects and identifies missing tests.

**Duration:** 4 weeks

**Dependencies:** Phase 1 and 2 complete

### Week 9: CLI Framework

| Task | Description | Est | Dependencies |
|------|-------------|-----|--------------|
| 3.1.1 | Set up CLI framework (Commander.js or Typer) | 4h | None |
| 3.1.2 | Implement command structure (analyze, generate, search, list) | 4h | 3.1.1 |
| 3.1.3 | Implement config file parsing (.pinata.yml) | 4h | 3.1.1 |
| 3.1.4 | Implement API key management (keychain storage) | 6h | 3.1.1 |
| 3.1.5 | Implement logging and verbose mode | 4h | 3.1.1 |
| 3.1.6 | Implement error handling and user-friendly messages | 4h | 3.1.1 |

**Command structure:**
```bash
pinata
├── analyze [path]          # Scan codebase for gaps
│   ├── --output, -o        # terminal, json, markdown, sarif
│   ├── --domains, -d       # Filter domains
│   ├── --severity, -s      # Minimum severity
│   ├── --fail-on           # Exit code threshold
│   └── --baseline, -b      # Compare to baseline
├── generate                # Generate tests
│   ├── --gaps              # All identified gaps
│   ├── --category, -c      # Specific category
│   ├── --output-dir        # Where to write tests
│   └── --dry-run           # Preview only
├── search <query>          # Search categories
├── list                    # List all categories
│   ├── --domain            # Filter by domain
│   └── --level             # Filter by level
├── init                    # Create .pinata.yml
└── auth                    # Manage API key
    ├── login               # Store API key
    └── logout              # Remove API key
```

**Deliverable:** CLI skeleton with all commands stubbed

### Week 10: Code Ingestion

| Task | Description | Est | Dependencies |
|------|-------------|-----|--------------|
| 3.2.1 | Implement file system walker with ignore patterns | 4h | None |
| 3.2.2 | Implement Python AST parser (tree-sitter) | 8h | 3.2.1 |
| 3.2.3 | Implement TypeScript AST parser (tree-sitter) | 8h | 3.2.1 |
| 3.2.4 | Implement function/class extraction from AST | 6h | 3.2.2-3 |
| 3.2.5 | Implement import graph building | 4h | 3.2.4 |
| 3.2.6 | Implement framework detection from config files | 4h | 3.2.1 |

**Framework detection:**
```typescript
interface FrameworkDetector {
  detect(projectRoot: string): DetectedFrameworks;
}

interface DetectedFrameworks {
  language: "python" | "typescript" | "javascript";
  webFramework?: "django" | "flask" | "fastapi" | "express" | "nextjs";
  testFramework?: "pytest" | "unittest" | "jest" | "mocha" | "vitest";
  orm?: "sqlalchemy" | "django-orm" | "prisma" | "typeorm";
}

// Detection rules
const rules = {
  pytest: ["pytest.ini", "pyproject.toml[tool.pytest]", "conftest.py"],
  jest: ["jest.config.js", "package.json[jest]"],
  django: ["manage.py", "settings.py"],
  express: ["package.json[express]"],
  // ...
};
```

**Deliverable:** Code ingestion with AST parsing for Python and TypeScript

### Week 11: Pattern Matching & Gap Detection

| Task | Description | Est | Dependencies |
|------|-------------|-----|--------------|
| 3.3.1 | Implement AST query executor | 8h | 3.2.4 |
| 3.3.2 | Implement regex pattern matcher | 4h | 3.2.1 |
| 3.3.3 | Implement test file detector (naming conventions) | 4h | 3.2.1 |
| 3.3.4 | Implement coverage calculator (tests per category) | 6h | 3.3.1-3 |
| 3.3.5 | Implement Pinata Score algorithm | 4h | 3.3.4 |
| 3.3.6 | Implement gap prioritization (severity × confidence) | 4h | 3.3.4 |

**AST query examples:**
```
# SQL Injection detection (Python)
call(
  func=attribute(attr="execute"),
  args=[binary_op(op="%") | call(func=attribute(attr="format"))]
)

# Missing timeout (Python requests)
call(
  func=attribute(value=name("requests"), attr="get|post|put|delete")
) where not contains(kwargs, "timeout")

# Missing auth check (Express)
call(
  func=attribute(attr="get|post|put|delete"),
  args=[string, function]
) where not preceded_by(call(func=name("authenticate")))
```

**Deliverable:** Pattern matching engine with gap detection

### Week 12: Output & Reporting

| Task | Description | Est | Dependencies |
|------|-------------|-----|--------------|
| 3.4.1 | Implement terminal output with colors and tables | 6h | 3.3 |
| 3.4.2 | Implement JSON output | 2h | 3.3 |
| 3.4.3 | Implement Markdown output | 2h | 3.3 |
| 3.4.4 | Implement SARIF output (GitHub Security) | 6h | 3.3 |
| 3.4.5 | Implement exit codes for CI/CD | 2h | 3.3 |
| 3.4.6 | End-to-end testing on real codebases | 8h | All |
| 3.4.7 | Performance optimization (target: 1k files in 30s) | 6h | All |

**Terminal output example:**
```
 ____  _             _        
|  _ \(_)_ __   __ _| |_ __ _ 
| |_) | | '_ \ / _` | __/ _` |
|  __/| | | | | (_| | || (_| |
|_|   |_|_| |_|\__,_|\__\__,_|

Analyzing: /path/to/project
Files: 342 | Languages: Python, TypeScript

╔══════════════════════════════════════════════════════════════╗
║                     Pinata Score: 67/100                     ║
╚══════════════════════════════════════════════════════════════╝

Domain Coverage:
  Security          ████████░░░░░░░░  52%  (5/10 categories)
  Data              ██████████████░░  85%  (7/8 categories)
  Concurrency       ████░░░░░░░░░░░░  33%  (2/6 categories)
  Input             ████████████████ 100%  (6/6 categories)

Critical Gaps (3):
  ⛔ sql-injection         src/db/queries.py:45      HIGH confidence
  ⛔ auth-bypass           src/api/routes.py:123    HIGH confidence
  ⛔ race-condition-db     src/services/order.py:67  MED confidence

Run `pinata generate --gaps` to create tests for these gaps.
```

**Deliverable:** Full CLI with all output formats

### Phase 3 Output

```
src/
  cli/
    index.ts               # Entry point
    commands/
      analyze.ts           # Analyze command
      generate.ts          # Generate command
      search.ts            # Search command
      list.ts              # List command
      init.ts              # Init command
      auth.ts              # Auth command
    config/
      loader.ts            # .pinata.yml parsing
      schema.ts            # Config schema
  ingestion/
    walker.ts              # File system traversal
    parsers/
      python.ts            # Python AST
      typescript.ts        # TypeScript AST
    framework-detector.ts  # Framework detection
  analysis/
    pattern-matcher.ts     # AST query executor
    gap-detector.ts        # Coverage calculation
    scorer.ts              # Pinata Score
  output/
    terminal.ts            # Colored tables
    json.ts                # JSON format
    markdown.ts            # Markdown format
    sarif.ts               # SARIF format
```

---

## Phase 4: Framework Integration

**Goal:** Deep integration with popular test frameworks for seamless adoption.

**Duration:** 4 weeks

**Dependencies:** Phase 3 complete

### Week 13: pytest Integration

| Task | Description | Est | Dependencies |
|------|-------------|-----|--------------|
| 4.1.1 | Detect pytest configuration (pytest.ini, pyproject.toml) | 4h | 3.2.6 |
| 4.1.2 | Extract existing fixtures from conftest.py | 6h | 3.2.2 |
| 4.1.3 | Generate tests that reuse existing fixtures | 6h | 4.1.2 |
| 4.1.4 | Generate conftest.py additions for new fixtures | 4h | 4.1.2 |
| 4.1.5 | Respect project's pytest plugins (pytest-asyncio, etc) | 4h | 4.1.1 |
| 4.1.6 | Generate pytest marks for categorization | 2h | 4.1.1 |
| 4.1.7 | Validate generated tests run with pytest | 4h | All |

**Fixture integration example:**
```python
# Detected in conftest.py:
@pytest.fixture
def db_session():
    ...

@pytest.fixture  
def authenticated_client():
    ...

# Generated test uses existing fixtures:
def test_user_cannot_access_other_users_data(db_session, authenticated_client):
    """Verify horizontal privilege escalation is prevented"""
    other_user = create_user(db_session)
    response = authenticated_client.get(f"/users/{other_user.id}/settings")
    assert response.status_code == 403
```

**Deliverable:** pytest-native test generation

### Week 14: Jest Integration

| Task | Description | Est | Dependencies |
|------|-------------|-----|--------------|
| 4.2.1 | Detect Jest configuration (jest.config.js, package.json) | 4h | 3.2.6 |
| 4.2.2 | Extract existing test utilities and mocks | 6h | 3.2.3 |
| 4.2.3 | Generate tests using project's mock patterns | 6h | 4.2.2 |
| 4.2.4 | Handle ES modules vs CommonJS imports | 4h | 4.2.1 |
| 4.2.5 | Generate tests compatible with jest-extended if present | 2h | 4.2.1 |
| 4.2.6 | Support TypeScript tests with ts-jest | 4h | 4.2.1 |
| 4.2.7 | Validate generated tests run with Jest | 4h | All |

**Deliverable:** Jest-native test generation

### Week 15: Additional Frameworks

| Task | Description | Est | Dependencies |
|------|-------------|-----|--------------|
| 4.3.1 | Vitest support (modern Jest alternative) | 6h | 4.2 |
| 4.3.2 | Mocha + Chai support | 6h | 4.2 |
| 4.3.3 | unittest (Python stdlib) support | 4h | 4.1 |
| 4.3.4 | Go testing package support | 8h | 3.2 |
| 4.3.5 | JUnit 5 support (Java) | 8h | 3.2 |

**Deliverable:** 6 test framework integrations

### Week 16: CI/CD Integration

| Task | Description | Est | Dependencies |
|------|-------------|-----|--------------|
| 4.4.1 | Create GitHub Action (pinata/action) | 6h | 3.4 |
| 4.4.2 | Create GitLab CI template | 4h | 3.4 |
| 4.4.3 | Create CircleCI orb | 4h | 3.4 |
| 4.4.4 | Implement incremental analysis (changed files only) | 8h | 3.3 |
| 4.4.5 | Implement baseline comparison (vs main branch) | 6h | 3.3 |
| 4.4.6 | Implement PR comment with gap summary | 4h | 4.4.1-3 |

**GitHub Action:**
```yaml
# .github/workflows/pinata.yml
name: Pinata Analysis
on: [push, pull_request]

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pinata/action@v1
        with:
          api_key: ${{ secrets.PINATA_API_KEY }}
          fail_on: critical
          baseline: ${{ github.base_ref }}
        
      # Comment on PR with results
      - uses: pinata/action/comment@v1
        if: github.event_name == 'pull_request'
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

**Deliverable:** Ready-to-use CI/CD integrations

### Phase 4 Output

```
src/
  frameworks/
    pytest/
      detector.ts          # Config detection
      fixtures.ts          # Fixture extraction
      generator.ts         # pytest-specific generation
    jest/
      detector.ts
      mocks.ts
      generator.ts
    vitest/
      ...
    mocha/
      ...
    go/
      ...
    junit/
      ...
  ci/
    github/
      action.yml           # GitHub Action definition
      index.ts             # Action logic
    gitlab/
      template.yml
    circleci/
      orb.yml
    incremental.ts         # Changed file detection
    baseline.ts            # Branch comparison
```

---

## Phase 5: Reporting Dashboard

**Goal:** Web dashboard showing coverage by risk domain with team features.

**Duration:** 4 weeks

**Dependencies:** Phase 4 complete

### Week 17: Backend API

| Task | Description | Est | Dependencies |
|------|-------------|-----|--------------|
| 5.1.1 | Set up API framework (FastAPI or Express) | 4h | None |
| 5.1.2 | Implement authentication (JWT, API keys) | 6h | 5.1.1 |
| 5.1.3 | Implement analysis storage (Postgres) | 6h | 5.1.1 |
| 5.1.4 | Implement /analyze endpoint (async job) | 6h | 5.1.3 |
| 5.1.5 | Implement /analysis/{id} endpoint | 4h | 5.1.3 |
| 5.1.6 | Implement /repos endpoint (list user repos) | 4h | 5.1.3 |

**API schema:**
```
POST /api/v1/analyze
  Request: { repo_url, branch, options }
  Response: { analysis_id, status: "pending" }

GET /api/v1/analysis/{id}
  Response: { 
    status, 
    pinata_score,
    domain_scores: [...],
    gaps: [...],
    generated_tests: [...]
  }

GET /api/v1/repos
  Response: { repos: [{ id, name, last_analysis, score }] }

GET /api/v1/repos/{id}/history
  Response: { analyses: [{ id, date, score, gaps_count }] }
```

**Deliverable:** REST API for dashboard

### Week 18: Dashboard Frontend

| Task | Description | Est | Dependencies |
|------|-------------|-----|--------------|
| 5.2.1 | Set up Next.js with Tailwind | 4h | None |
| 5.2.2 | Implement authentication pages (login, signup) | 6h | 5.1.2 |
| 5.2.3 | Implement dashboard home (repo list, scores) | 8h | 5.1.6 |
| 5.2.4 | Implement repo detail page (domain heatmap) | 8h | 5.1.5 |
| 5.2.5 | Implement gap list with filtering | 6h | 5.1.5 |

**Dashboard home mockup:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Pinata Dashboard                              [user@email.com] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Team Score: 72/100  ▲ +5 from last week                       │
│                                                                 │
│  ┌─────────────────┬─────────────────┬─────────────────┐       │
│  │ backend-api     │ frontend-app    │ shared-libs     │       │
│  │ Score: 68       │ Score: 81       │ Score: 74       │       │
│  │ 12 gaps         │ 4 gaps          │ 7 gaps          │       │
│  │ Last: 2h ago    │ Last: 1d ago    │ Last: 3d ago    │       │
│  └─────────────────┴─────────────────┴─────────────────┘       │
│                                                                 │
│  Critical Gaps Across Team:                                     │
│  ⛔ sql-injection      backend-api    src/db/queries.py:45     │
│  ⛔ auth-bypass        backend-api    src/api/routes.py:123    │
│  ⛔ xss-stored         frontend-app   src/components/Comment.tsx│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Deliverable:** Basic dashboard with repo overview

### Week 19: Visualizations & Detail Views

| Task | Description | Est | Dependencies |
|------|-------------|-----|--------------|
| 5.3.1 | Implement domain coverage heatmap (Recharts) | 6h | 5.2.4 |
| 5.3.2 | Implement score trend chart | 4h | 5.2.4 |
| 5.3.3 | Implement gap detail modal with code snippet | 6h | 5.2.5 |
| 5.3.4 | Implement generated test preview | 6h | 5.3.3 |
| 5.3.5 | Implement one-click copy of generated tests | 2h | 5.3.4 |
| 5.3.6 | Implement comparison view (vs baseline) | 6h | 5.2.4 |

**Domain heatmap:**
```
                 Unit   Integration   System   Chaos
Security         ██░░   ████░░░░░░   ░░░░░░   ░░░░░░
Data             ████   ██████████   ████░░   ░░░░░░  
Concurrency      ██░░   ████░░░░░░   ░░░░░░   ░░░░░░
Input            ████   ████████░░   ██░░░░   ░░░░░░
Resource         ████   ████░░░░░░   ░░░░░░   ░░░░░░
Reliability      ░░░░   ██░░░░░░░░   ░░░░░░   ░░░░░░

Legend: ████ = covered, ░░░░ = gap
```

**Deliverable:** Rich visualizations for coverage analysis

### Week 20: Team Features & Polish

| Task | Description | Est | Dependencies |
|------|-------------|-----|--------------|
| 5.4.1 | Implement team/org management | 6h | 5.1.2 |
| 5.4.2 | Implement gap assignment to team members | 4h | 5.2.5 |
| 5.4.3 | Implement gap status tracking (open/resolved) | 4h | 5.2.5 |
| 5.4.4 | Implement email notifications for new critical gaps | 4h | 5.1.4 |
| 5.4.5 | Implement scheduled analysis (daily/weekly) | 4h | 5.1.4 |
| 5.4.6 | Polish UI, loading states, error handling | 6h | All |
| 5.4.7 | Deploy to production (Vercel + Railway) | 4h | All |

**Deliverable:** Production-ready dashboard with team features

### Phase 5 Output

```
apps/
  api/
    src/
      routes/
        analyze.ts
        repos.ts
        auth.ts
      services/
        analyzer.ts
        storage.ts
      db/
        schema.sql
        migrations/
  web/
    src/
      app/
        page.tsx              # Dashboard home
        repos/[id]/page.tsx   # Repo detail
        gaps/[id]/page.tsx    # Gap detail
      components/
        DomainHeatmap.tsx
        ScoreTrend.tsx
        GapList.tsx
        TestPreview.tsx
```

---

## Dependency Graph

```
Phase 1: Taxonomy ─────────────────┐
         │                         │
         ▼                         │
Phase 2: Templates ────────────────┤
         │                         │
         ▼                         │
Phase 3: CLI ──────────────────────┤
         │                         │
         ▼                         │
Phase 4: Frameworks ───────────────┤
         │                         │
         ▼                         │
Phase 5: Dashboard ◄───────────────┘
```

**Critical Path:**
1. Category schema (1.1.1) blocks everything
2. CategoryStore (1.2.1) blocks template development
3. AST parsing (3.2.2-3) blocks pattern matching
4. Pattern matching (3.3.1) blocks gap detection
5. CLI completion (Phase 3) blocks dashboard backend

---

## Resource Requirements

### Engineering

| Phase | Weeks | Engineer-Weeks | Notes |
|-------|-------|----------------|-------|
| 1 | 4 | 4 | Category design is foundational |
| 2 | 4 | 4 | Template quality is critical |
| 3 | 4 | 4 | Core product functionality |
| 4 | 4 | 4 | Framework expertise helpful |
| 5 | 4 | 4 | Full-stack work |
| **Total** | **20** | **20** | 1 engineer × 20 weeks |

With 2 engineers, phases can overlap:
- Engineer A: Phase 1 → Phase 3 → Phase 5 backend
- Engineer B: Phase 2 → Phase 4 → Phase 5 frontend
- **Timeline reduction: 20 weeks → 12 weeks**

### Infrastructure

| Service | Purpose | Est. Monthly Cost |
|---------|---------|-------------------|
| Vercel | Web dashboard hosting | $20 |
| Railway/Render | API hosting | $25 |
| Postgres | Analysis storage | $15 |
| Redis | Caching | $10 |
| Claude API | Test generation | $100-500 (usage) |
| GitHub | Actions minutes | Free tier |
| **Total** | | **$170-570/mo** |

---

## Risk Register

| Risk | Phase | Impact | Mitigation |
|------|-------|--------|------------|
| Tree-sitter learning curve | 3 | Schedule slip | Allocate extra time, use existing bindings |
| LLM output quality | 2 | Low adoption | Extensive prompt engineering, fallback to templates |
| False positive rate | 3 | User frustration | Test on 20+ real codebases before launch |
| Framework detection errors | 4 | Broken tests | Conservative detection, user override |
| Dashboard scope creep | 5 | Never ships | Strict MVP scope, defer features |

---

## Success Criteria by Phase

| Phase | Criterion | Target |
|-------|-----------|--------|
| 1 | Categories defined and validated | 40 categories |
| 2 | Templates generate valid tests | 100% parse success |
| 3 | CLI analyzes real codebases | < 60s for 1k files |
| 4 | Tests run in target frameworks | 100% run success |
| 5 | Dashboard shows meaningful data | < 3s page load |

**Overall MVP Success:**
- Analyze 100 real codebases
- Find valid gaps in 80%+
- < 20% false positive rate
- 50 beta users
