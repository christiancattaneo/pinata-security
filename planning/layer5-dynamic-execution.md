# Layer 5: Dynamic Execution

The moat. What makes Pinata different from every other scanner.

## The Problem

Static analysis (layers 1-3) can only say **"this looks like a vulnerability"**. Even with AI verification, you're still guessing. False positive rates of 15-30% are considered good in the industry.

Dynamic execution says **"this IS a vulnerability, I proved it"**.

## The Vision

```bash
# Current (layers 1-3)
pinata analyze . --verify
# Output: "Potential SQL injection at db.ts:42" (maybe real, maybe not)

# Future (layer 5)
pinata analyze . --execute
# Output: "CONFIRMED SQL injection at db.ts:42 - exploit succeeded"
#         "Test: injected ' OR 1=1 --, returned all 1000 users instead of 1"
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Pinata CLI                                │
├─────────────────────────────────────────────────────────────┤
│  analyze . --execute                                         │
│      │                                                       │
│      ▼                                                       │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐       │
│  │ Layer 1-3   │ → │ Layer 4     │ → │ Layer 5     │       │
│  │ Detection   │   │ Generate    │   │ Execute     │       │
│  │ + Verify    │   │ Test Code   │   │ in Sandbox  │       │
│  └─────────────┘   └─────────────┘   └──────┬──────┘       │
│                                              │               │
│                                              ▼               │
│                                     ┌───────────────┐       │
│                                     │ Docker        │       │
│                                     │ Sandbox       │       │
│                                     │ ┌───────────┐ │       │
│                                     │ │ Test      │ │       │
│                                     │ │ Runner    │ │       │
│                                     │ └───────────┘ │       │
│                                     │ ┌───────────┐ │       │
│                                     │ │ App       │ │       │
│                                     │ │ Under     │ │       │
│                                     │ │ Test      │ │       │
│                                     │ └───────────┘ │       │
│                                     └───────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

## Execution Modes

### Mode 1: Local Docker (default)
```bash
pinata analyze . --execute
```
- Requires Docker installed locally
- Spins up isolated containers
- No network egress allowed
- Free (user pays for compute)

### Mode 2: Cloud Sandbox (paid)
```bash
pinata analyze . --execute --cloud
```
- Pinata hosts the sandbox infrastructure
- Firecracker microVMs for stronger isolation
- Pay per execution (~$0.10/test)
- Required for enterprise/CI where Docker isn't available

### Mode 3: Dry Run
```bash
pinata analyze . --execute --dry-run
```
- Shows what would be executed
- Outputs test code without running
- Safe preview

## Sandbox Specification

### Container Image: `pinata-sandbox`

```dockerfile
FROM node:20-slim AS node-runner
FROM python:3.11-slim AS python-runner

# Multi-stage for multiple language support
# Each language runtime isolated

# Security hardening
USER nonroot
WORKDIR /sandbox
ENV NODE_ENV=production

# No network by default
# Mounted volumes are read-only where possible
# Capped resources: 1 CPU, 512MB RAM, 30s timeout
```

### Security Constraints

| Constraint | Value | Rationale |
|------------|-------|-----------|
| Network | disabled | Prevent exfiltration/attacks |
| CPU | 1 core | Prevent DoS |
| Memory | 512MB | Prevent DoS |
| Timeout | 30s | Prevent infinite loops |
| Filesystem | /sandbox only, mostly read-only | Isolation |
| User | nonroot (UID 65534) | Privilege reduction |
| Capabilities | none | Minimal privileges |
| Seccomp | default Docker profile | Syscall filtering |

### Docker Run Command
```bash
docker run --rm \
  --network none \
  --cpus 1 \
  --memory 512m \
  --timeout 30 \
  --read-only \
  --tmpfs /tmp:rw,size=64m \
  --user 65534:65534 \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  -v /path/to/test.ts:/sandbox/test.ts:ro \
  -v /path/to/target:/sandbox/target:ro \
  pinata-sandbox \
  run-test /sandbox/test.ts
```

## Test Execution Flow

```
1. Gap detected: SQL injection at db.ts:42
     │
     ▼
2. Generate test code (Layer 4)
     │  - Extract vulnerable function
     │  - Generate test with injection payloads
     │  - Include assertions for successful exploit
     │
     ▼
3. Prepare sandbox
     │  - Copy target code to sandbox
     │  - Copy generated test to sandbox
     │  - Install minimal dependencies
     │
     ▼
4. Execute test
     │  - Run: vitest run test.ts (or pytest, etc.)
     │  - Capture stdout, stderr, exit code
     │  - Enforce timeout
     │
     ▼
5. Interpret results
     │  - Exit 0 + assertions pass = CONFIRMED vulnerability
     │  - Exit 1 + assertion fail = False positive (or bad test)
     │  - Timeout/crash = Inconclusive
     │
     ▼
6. Report
     - CONFIRMED: "SQL injection exploitable, payload succeeded"
     - UNCONFIRMED: "Could not verify, test failed"
     - ERROR: "Execution failed: [reason]"
```

## Example: SQL Injection

### Detected Gap
```typescript
// db.ts:42
const user = await db.query(`SELECT * FROM users WHERE id = ${userId}`);
```

### Generated Test (Layer 4)
```typescript
// generated/db-sql-injection.test.ts
import { describe, it, expect } from 'vitest';
import { mockDb } from './fixtures';

describe('SQL Injection Verification', () => {
  it('confirms injection via UNION attack', async () => {
    const maliciousId = "1 UNION SELECT * FROM admin_users --";
    
    // This should NOT return admin users if properly sanitized
    const result = await getUserById(maliciousId);
    
    // If we get admin data, injection succeeded
    expect(result).toContainEqual(
      expect.objectContaining({ role: 'admin' })
    );
  });
  
  it('confirms injection via boolean blind', async () => {
    const payload1 = "1 AND 1=1";  // Should return user
    const payload2 = "1 AND 1=2";  // Should return nothing if injectable
    
    const result1 = await getUserById(payload1);
    const result2 = await getUserById(payload2);
    
    // Different results = injectable
    expect(result1.length).not.toBe(result2.length);
  });
});
```

### Sandbox Execution
```bash
$ pinata execute db-sql-injection.test.ts

Running in sandbox: pinata-sandbox:node20
Target: db.ts (function getUserById)
Payloads: UNION attack, boolean blind

[1/2] UNION attack... PASSED (injection confirmed)
      Payload: 1 UNION SELECT * FROM admin_users --
      Result: Returned 5 admin users (expected 0)
      
[2/2] Boolean blind... PASSED (injection confirmed)
      Payload 1 returned 1 row, Payload 2 returned 0 rows
      Differential confirms SQL injection

RESULT: CONFIRMED SQL INJECTION
  Location: db.ts:42
  Function: getUserById
  Severity: CRITICAL
  Evidence: UNION attack returned unauthorized data
```

## Test Categories by Vulnerability Type

### Directly Testable (high value for Layer 5)
| Vulnerability | Test Approach |
|--------------|---------------|
| SQL Injection | Inject payloads, check for data leakage or errors |
| XSS | Inject script tags, check if rendered unescaped |
| Command Injection | Inject shell commands, check for execution |
| Path Traversal | Inject ../../../etc/passwd, check file access |
| SSRF | Inject internal URLs, check for requests |
| Deserialization | Inject malicious objects, check for code execution |

### Partially Testable
| Vulnerability | Challenge |
|--------------|-----------|
| Auth Bypass | Needs realistic auth setup |
| Race Conditions | Timing-dependent, flaky |
| Memory Safety | Needs specific runtime (Rust, C) |

### Not Testable Dynamically
| Vulnerability | Why |
|--------------|-----|
| Hardcoded Secrets | Static analysis sufficient |
| Missing Encryption | Requires runtime data inspection |
| Insecure Dependencies | Requires npm audit, not execution |

## Implementation Plan

### Phase 1: Local Docker MVP
```
Files to create:
  src/execution/
    sandbox.ts          # Docker container management
    runner.ts           # Test execution orchestration
    results.ts          # Result parsing and interpretation
    fixtures.ts         # Mock database, HTTP, etc.
```

**CLI addition:**
```bash
pinata analyze . --execute          # Run with Docker
pinata analyze . --execute --dry-run  # Preview only
```

**MVP scope:**
- TypeScript/JavaScript tests only
- Vitest runner
- SQL injection, XSS, command injection (3 vuln types)
- Local Docker only

### Phase 2: Multi-language
- Add Python (pytest)
- Add Go (go test)
- Shared fixture library per language

### Phase 3: Cloud Sandbox
- Firecracker microVM infrastructure
- API for remote execution
- Usage metering and billing
- `--cloud` flag

### Phase 4: Smart Fixtures
- AI-generated mock data
- Auto-detect database schema from code
- Generate realistic test fixtures

## Cost Model

### Local Execution (user's machine)
- **Cost to user**: Electricity + time
- **Cost to Pinata**: $0
- **Latency**: 5-30s per test

### Cloud Execution
- **Cost to Pinata**: ~$0.01-0.05 per test (compute)
- **Price to user**: ~$0.10 per test (with margin)
- **Latency**: 2-10s per test (optimized infra)

### Example scan with dynamic execution
```
100 static matches
 → 28 AI-verified gaps
 → 28 tests generated
 → 28 tests executed
 → 22 CONFIRMED, 6 unconfirmed

Cost: 28 × $0.10 = $2.80
Time: 28 × 5s = 2.3 minutes (parallel: 30s)
```

## Differentiation

**What others do:**
- Snyk: Static analysis + known vulnerability database
- Semgrep: Pattern matching + some taint tracking
- CodeQL: Deep static analysis (slow, complex)

**What we'd do:**
- Static + AI + **actual exploitation**
- "CONFIRMED" vs "POTENTIAL" - eliminates false positive debate
- Generate tests developers can keep and maintain
- Ground truth security scanner

**The pitch:**
> "Other scanners tell you something might be wrong. 
> Pinata proves it by exploiting the vulnerability in a sandbox."

## Open Questions

1. **Fixture generation** - How do we auto-generate realistic test fixtures without human intervention? AI + schema inference?

2. **Coverage** - Some vulnerabilities need complex setup (OAuth flows, payment integration). How far do we go?

3. **False negatives** - If our test doesn't trigger the vuln, is it a false positive or a bad test? How do we distinguish?

4. **Speed vs depth** - Full exploitation takes time. Do we do quick smoke tests or thorough exploitation?

5. **Self-scanning** - Should Pinata be able to prove its own vulnerabilities? Meta question but important for dogfooding.

## Next Steps

1. Create `src/execution/` module structure
2. Build Docker sandbox image
3. Implement runner for TypeScript/Vitest
4. Add `--execute` flag to CLI
5. Test on Pinata's own codebase (dogfood)
6. Expand to other languages/vulnerability types
