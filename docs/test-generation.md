# test generation: what to build and where it lives

## the question

pinata finds security vulnerabilities. should it also generate tests for them? or should that be a separate tool? and how do you know the generated tests are actually good?

## what devs actually want

talked to the codebase, read the research, thought about it. here's what's useful in order of impact:

**1. a test that fails right now.** not a template. not a stub. a file i can drop into my project that fails against my current vulnerable code. if i fix the vulnerability, the test passes. that's the entire value. this is a regression gate.

**2. the test runs in my existing framework.** vitest if i use vitest, pytest if i use pytest. uses my existing imports, my project structure, my config. not some alien test format i have to adapt.

**3. it tests the actual vulnerability, not a generic list.** "here are 8 SQL injection strings" is a cheat sheet. "this specific endpoint takes `id` from `req.params` and interpolates it into a Postgres query on line 47" is a test. context-aware > generic.

**4. i can trust it catches real attacks.** not "we generated a test and it exists." proof that the test actually detects the vulnerability. mutation testing is the only honest way to measure this.

## where test generation lives

per tool-definitions.md, each tool does one thing. the question: does test generation belong in pinata, a standalone tool, or somewhere else?

**option A: pinata generates tests (extend pinata)**

pinata already has the vulnerability context. it knows the file, line, pattern, code snippet. generating a test from that context is a natural extension of the scan output. instead of `pinata analyze . → findings`, it becomes `pinata analyze . → findings + test files`.

pros: all context is already in pinata. one tool, one command. no data handoff.
cons: pinata becomes two things (scanner + test generator). violates single responsibility.

**option B: standalone test generator (new tool)**

a new tool that consumes pinata's output and generates tests. `pinata analyze . --output json | testgen --framework vitest`.

pros: clean separation. test generation logic doesn't bloat pinata. can also consume slopometer findings.
cons: extra tool, extra install, data handoff friction.

**option C: inprod orchestrates (inprod calls pinata then generates)**

inprod's generators already have this in the roadmap. `inprod complete .` was supposed to generate missing tests. let inprod call pinata for findings, then generate tests from those findings.

pros: unified experience. inprod already owns "complete missing things."
cons: inprod's generators don't exist yet. blocked on building inprod's generation layer.

**recommendation: pinata generates, inprod orchestrates later.**

add `pinata generate` as a real feature (not the current template system). pinata has all the context it needs. when inprod's unified CLI exists, it calls `pinata generate` internally. no data handoff, no new tool, ships now.

## how it works

### step 1: context extraction

current pinata knows: file path, line number, pattern ID, code snippet (5 lines).

needed: the **full function** containing the vulnerability, its **imports**, the **test framework** in use, the **project structure**, and any **existing tests** to match style.

```
finding: sql-injection at src/api/users.ts:47
    ↓
extract:
  function: getUserById(id: string) { ... full body ... }
  imports: import { db } from '../db'; import { Request, Response } from 'express';
  framework: vitest (from package.json devDependencies)
  existing tests: tests/api/users.test.ts exists (match style)
  route: app.get('/api/users/:id', getUserById)
  db type: postgres (from prisma schema or connection string)
```

this context is what makes the generated test real instead of generic.

### step 2: AI generation

send the vulnerability + full context to claude/gpt. not a template fill. a genuine generation request.

the prompt:

```
You are generating a security test for a confirmed vulnerability.

Vulnerability: SQL injection
File: src/api/users.ts:47  
Function: getUserById
Code: [full function]
Framework: Express + Postgres
Test framework: vitest
Existing test style: [sample from existing test file]

Generate a complete, runnable vitest test file that:
1. Tests the specific vulnerable code path
2. Uses payloads targeting PostgreSQL specifically
3. Verifies the function either rejects, escapes, or parameterizes the input
4. Tests boundary cases (empty string, null, very long input, unicode)
5. Must FAIL against the current code (proving the vulnerability exists)

Output only the test file. No explanations.
```

the output is a complete `.test.ts` file with real imports, real function calls, real assertions.

### step 3: validation (the hard part)

a generated test is worthless unless proven effective. three checks:

**check 1: does it compile?** run `tsc --noEmit` on the generated test. if types don't resolve, fix or regenerate.

**check 2: does it fail against current code?** run the test. if it passes, the test doesn't actually catch the vulnerability. regenerate with different approach.

**check 3: mutation score.** use stryker to mutate the vulnerable line (remove the string interpolation, replace with parameterized query). run the generated test against the mutant. if the test passes (catches the fix), the test is valid. the mutation kill rate is the quality score.

```
generated test → run against original code → FAILS (good, catches vuln)
generated test → run against fixed code    → PASSES (good, regression gate)
mutation score: 94% (stryker killed 15/16 mutants)
```

if check 2 fails (test passes against vulnerable code), the test is useless. regenerate.

### step 4: property hardening (optional, highest quality)

beyond specific payload tests, generate **property-based tests** using fast-check:

```typescript
import { fc } from 'fast-check';

test('getUserById never interpolates input into SQL', () => {
  fc.assert(
    fc.property(fc.string(), (input) => {
      const query = captureQuery(() => getUserById(input));
      // The input string should never appear raw in the query
      expect(query).not.toContain(input);
      // Query should use parameterized placeholders
      expect(query).toMatch(/\$\d+|\?/);
    })
  );
});
```

this tests the **invariant** (input never appears raw in SQL) against thousands of random inputs. it catches attacks nobody's thought of yet. it survives code refactoring. it's the purest form of crystallized intent.

## making it universal (any project)

the test generator needs to handle any project. the key variables:

| variable | how to detect | fallback |
|----------|--------------|----------|
| language | file extension | typescript |
| test framework | package.json devDeps, existing test files | vitest/jest (JS), pytest (python) |
| test style | parse existing test files for patterns | standard conventions |
| project structure | existing test directory location | `tests/` or `__tests__/` |
| db type | connection strings, ORM config, imports | generic SQL |
| web framework | imports, package.json deps | generic HTTP |

for a python django project, it generates pytest tests with django test client. for a go gin project, it generates go test files with httptest. the detection already exists in pinata's project-type system. extend it to detect test conventions.

**language support priority:**
1. typescript/javascript (vitest, jest) - most users
2. python (pytest) - second most
3. go (go test) - third
4. java (junit) - enterprise
5. rust (cargo test) - niche

## what "good" means (summarized)

| metric | what it measures | tool |
|--------|-----------------|------|
| **fails against vulnerable code** | test catches the actual vulnerability | run test, check exit code |
| **passes after fix** | test works as regression gate | run test after patching |
| **mutation kill rate** | test quality (not just coverage) | stryker |
| **property coverage** | invariants hold for all inputs | fast-check/hypothesis |
| **compiles/runs** | test is syntactically valid | tsc + vitest/pytest |

a generated test with 0% mutation kill rate is a test that exists but proves nothing. a test with 90%+ kill rate actually catches bugs. mutation testing is the only honest quality metric.

## the output

```bash
$ pinata analyze . --generate

Scanning...
Found 3 security findings (AI-verified)

Generating tests:
  tests/security/sqli-get-user.test.ts    ✓ generated, fails against current code
  tests/security/xss-comment-form.test.ts ✓ generated, fails against current code  
  tests/security/path-traversal-file.test.ts ✓ generated, fails against current code

Validation:
  All 3 tests compile and fail correctly (proving vulnerabilities exist)
  Mutation score: 87% average (stryker verified)

Tests written to tests/security/
Add to CI to prevent regressions.
```

## implementation order

1. **context extraction** - read full functions, detect framework/style
2. **AI generation** - complete runnable test files from context
3. **compile check** - verify generated tests are syntactically valid
4. **fail check** - verify tests fail against current code
5. **mutation verification** - stryker integration for quality scoring
6. **property generation** - fast-check invariants for highest-quality output
7. **multi-language** - python, go, java support beyond typescript
