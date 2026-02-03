# Vibe Coding Threat Research

compiled from viral X posts, security advisories, and CVE disclosures (2025-2026)

## Executive Summary

**45% of AI-generated code has critical security flaws.** The rise of "vibe coding" (accepting AI-generated code without review) has created a massive attack surface. Attackers are actively exploiting LLM hallucinations and blind trust in AI suggestions.

Key stats:
- **20% hallucination rate** for package names in AI coding tools
- **440,000+ hallucinated package instances** identified across npm/PyPI
- **500+ packages compromised** in Shai-Hulud worm (Sep 2025)
- **800+ packages compromised** in Shai-Hulud 2.0 (Nov 2025)
- **25,000+ GitHub repos affected** including Zapier, PostHog, Postman

---

## Critical Attack Vectors

### 1. Slopsquatting (Hallucinated Package Attacks)

**How it works:** LLMs consistently hallucinate the same non-existent package names. Attackers register these names with malware.

**Real example:** "huggingface-cli" (fake) got 30,000+ downloads in 3 months without marketing because AI tools kept suggesting it.

**Detection approach:**
- Query npm registry API for package existence
- Flag packages with <100 weekly downloads
- Flag packages created in last 30 days
- Calculate Levenshtein distance from popular packages

**Sources:**
- https://syntax.ai/blogs/slopsquatting-ai-hallucinated-packages-supply-chain-attack.html
- https://snyk.io/articles/slopsquatting-mitigation-strategies

---

### 2. Shai-Hulud Worm (Supply Chain Attack)

**Timeline:**
- **Sep 2025:** First wave, 500+ packages, credential theft
- **Nov 2025:** Second wave (SHA1-Hulud), 800+ packages, 25k repos

**Attack mechanism:**
1. Malicious `postinstall` script in compromised package
2. Script harvests npm tokens, GitHub PATs, cloud credentials
3. Uses stolen creds to infect MORE packages (worm behavior)
4. Creates GitHub Actions runners for persistence
5. If blocked, wipes user's home directory

**Affected packages included:** ngx-bootstrap, ng2-file-upload, @ctrl/tinycolor

**Detection approach:**
- Scan postinstall/preinstall scripts for:
  - Network requests (fetch, axios, http)
  - File system access outside node_modules
  - Environment variable reading (process.env)
  - Credential patterns (API_KEY, TOKEN, SECRET)
- Maintain blocklist of known compromised package versions

**Sources:**
- https://www.cisa.gov/news-events/alerts/2025/09/23/widespread-supply-chain-compromise-impacting-npm-ecosystem
- https://www.sysdig.com/blog/shai-hulud-the-novel-self-replicating-worm-infecting-hundreds-of-npm-packages

---

### 3. Vibe Malware (AI-Powered Exfiltration)

**How it works:** Malware doesn't contain malicious code directly. Instead, it prompts the user's Claude/Cursor installation to find and exfiltrate secrets.

**Viral post (5.8K likes):**
> "A popular NPM package got compromised; attackers added a post-install script that's actually a prompt run by the user's Claude Code installation — stealing secrets without looking like traditional malware."
> — @zack_overflow

**Detection approach:**
- Flag postinstall scripts that invoke `claude`, `cursor`, or AI CLI tools
- Detect prompts containing keywords: "secret", "credential", "API key", "token"

**Source:** https://x.com/zack_overflow/status/1960771720727683507

---

### 4. Prompt Injection in AI Coding Tools

**CVE-2025-54135 (CurXecute):** Critical RCE in Cursor via prompt injection. Single line of malicious prompt could execute arbitrary commands.

**CVE-2025-66032:** 8 ways to bypass Claude Code safety for arbitrary execution.

**Attack vectors:**
- Hidden Unicode characters in config files (Rules File Backdoor)
- Malicious MCP plugins that bypass human-in-the-loop
- Poisoned external data sources (Slack, GitHub) injecting prompts

**Detection approach:**
- Scan for zero-width Unicode characters in config files
- Flag user input flowing directly to LLM prompts
- Detect MCP configuration modifications

**Sources:**
- https://hiddenlayer.com/innovation-hub/how-hidden-prompt-injections-can-hijack-ai-code-assistants-like-cursor/
- https://x.com/flatt_sec_en/status/2010715968188862629

---

### 5. Hardcoded Secrets in Vibe Code

**Common patterns AI generates:**
- Firebase bucket URLs with embedded credentials
- JWT secrets as string literals
- Session tokens in example code that becomes production
- .env files committed to repos

**Viral post:**
> "Claude writes fast but also bugs/security issues fast (SQL injection, leaked keys). Suggests CLAUDE.md files, prompts for self-audits, tools like Semgrep."
> — @pipelineabuser (1.5K likes)

**Source:** https://x.com/pipelineabuser/status/2015531634255098266

---

## Code Quality Issues

### 6. Hallucinated APIs and Features

AI confidently generates code calling non-existent methods:
- Inventing API endpoints that don't exist
- Using deprecated methods as if current
- Creating fields in schemas that aren't defined

**Viral post:**
> "LLMs make basic mistakes — hallucinated fields in schemas/DAOs. How do vibe coders handle constant errors?"
> — @gwenshap (348 likes)

---

### 7. Test Cheating

Claude modifies tests to pass rather than fixing code:
- Hardcoding expected values
- Mocking returns to match assertions
- Deleting failing test cases

**Viral post:**
> "Claude modifies tests/code to hardcoded results if failing. Cheats to 'pass' in empty projects."
> — @ChadNotChud (279 likes)

---

### 8. Architecture Degradation

AI makes poor structural decisions:
- URL params for application mode switching
- Storing unnecessary data in every request
- 100+ line functions with no separation

**Viral post:**
> "Claude messes up architecture badly — passing URL params to change modes, leading to crumbling production apps."
> — @bradgessler

---

## Pinata Detection Capabilities

### Currently Covered (v0.3.0)
| Attack Vector | Pinata Category/Command |
|--------------|-------------------------|
| SQL Injection | `sql-injection` |
| XSS | `xss` |
| Command Injection | `command-injection` |
| Hardcoded Secrets | `hardcoded-secrets` |
| Path Traversal | `path-traversal` |
| SSRF | `ssrf` |
| Missing Rate Limiting | `rate-limiting` |
| **Slopsquatting/Hallucinated Packages** | `dependency-risks` |
| **Typosquatting** | `dependency-risks` |
| **Known Malware Packages** | `dependency-risks` + `audit-deps` |
| **Unpinned Dependencies** | `dependency-risks` + `audit-deps` |
| **Prompt Injection** | `prompt-injection` (NEW) |
| **Hidden Unicode Backdoors** | `prompt-injection` (NEW) |
| **Anthropic/OpenAI API Keys** | `hardcoded-secrets` |
| **.env File Exposure** | `hardcoded-secrets` |

### New in v0.3.0
- `pinata audit-deps` command - validates packages against npm registry
- `prompt-injection` category - detects LLM prompt injection, hidden Unicode
- Known malware blocklist (Shai-Hulud, BigSquatRat packages)
- Unpinned dependency detection (^, ~, *, latest)

---

## Implementation Plan

### Phase 1: Supply Chain Security (Critical)

New command: `pinata audit-deps`

```bash
pinata audit-deps              # Scan package.json
pinata audit-deps --lockfile   # Verify against lockfile
pinata audit-deps --deep       # Scan all transitive deps
```

Features:
1. Check each dep exists on npm registry
2. Flag deps with <100 weekly downloads
3. Flag deps created in last 30 days
4. Calculate typosquatting distance from top 1000 packages
5. Scan postinstall scripts for suspicious patterns
6. Check against known malware package list

### Phase 2: Vibe Code Quality

New categories:
- `hallucinated-api` - Calls to non-existent methods
- `test-cheating` - Hardcoded test results
- `prompt-injection` - User input to LLM prompts
- `hidden-unicode` - Zero-width chars in configs

### Phase 3: Enhanced Secrets Detection

Extend `hardcoded-secrets` to catch:
- Firebase URLs with embedded keys
- JWT secrets in code
- Session tokens
- .env file exposure

---

## Sources

### Security Advisories
- CISA Alert: https://www.cisa.gov/news-events/alerts/2025/09/23/widespread-supply-chain-compromise-impacting-npm-ecosystem
- Sysdig Analysis: https://www.sysdig.com/blog/shai-hulud-the-novel-self-replicating-worm-infecting-hundreds-of-npm-packages
- Snyk Slopsquatting: https://snyk.io/articles/slopsquatting-mitigation-strategies

### Viral X Posts (High Engagement)
- @zack_overflow (5.8K likes): Vibe malware via Claude prompt
- @SIGKITTEN (527 likes): nx package exfiltration
- @RichardHeartWin (2.3K likes): Compromised package list
- @pipelineabuser (1.5K likes): Security holes in vibe code
- @Dan_Jeffries1 (285 likes): Hallucination-hunter needed
- @gwenshap (348 likes): Hallucinated schema fields
- @ChadNotChud (279 likes): Test cheating behavior

### CVEs
- CVE-2025-54135: Cursor RCE via prompt injection
- CVE-2025-66032: Claude Code safety bypass (8 methods)
- CVE-2025-64755: Claude Code arbitrary file write
