# Pinata Phase 3 PRD: Go-to-Market

**Status:** In Progress
**Scope:** Public release, distribution, marketing, ecosystem

---

## Goals

1. **Make Pinata installable** via npm globally
2. **Create marketing presence** via landing page
3. **Enable discovery** via interactive demo
4. **Extend ecosystem** via IDE integration and language expansion

---

## Deliverables

### D1: npm Package Publication

**Goal:** `npx pinata analyze .` works from any machine.

**Tasks:**
- [ ] Finalize `package.json` for publication
- [ ] Add `bin` entry pointing to CLI
- [ ] Create `.npmignore` excluding dev files
- [ ] Add `prepublishOnly` script for build
- [ ] Publish to npm (scoped or unscoped TBD)
- [ ] Verify global install works

**Acceptance:** `npm install -g pinata && pinata --version` outputs version

### D2: Landing Page

**Goal:** Single-page marketing site explaining Pinata.

**Content:**
- Hero: "Find security blind spots before attackers do"
- Features: Detection categories, AI explanations, test generation
- Demo: Animated terminal or live playground
- Pricing: Free tier, Pro tier (TBD)
- Install: `npm install -g pinata`

**Tech:** Static site (Next.js static export or plain HTML)

**Location:** `apps/web/` or separate repo

### D3: Interactive TUI Dashboard

**Goal:** Rich terminal interface for exploring results.

**Features:**
- Real-time scan progress with file-by-file updates
- Gap list with severity coloring and navigation
- Detail view for selected gap (explanation, code, fix)
- Keyboard shortcuts (j/k navigation, enter for details, q to quit)

**Tech:** `ink` (React for terminal) or `blessed`

**Location:** `src/cli/tui/` or new command `pinata dashboard`

### D4: VS Code Extension

**Goal:** Inline gap highlighting in editor.

**Features:**
- Run scan on file save or command
- Underline detected gaps with squiggles
- Hover shows explanation
- Quick fix suggestions
- Problems panel integration

**Tech:** VS Code Extension API, Language Server Protocol optional

**Location:** `apps/vscode/` or separate repo `pinata-vscode`

### D5: Language Expansion

**Goal:** Detection patterns for Go, Java, Rust.

**Priority by usage:**
1. **Go** - Web services, cloud infra
2. **Java** - Enterprise, Spring Boot
3. **Rust** - Systems, security-critical

**Per language:**
- [ ] SQL injection patterns
- [ ] Command injection patterns  
- [ ] Path traversal patterns
- [ ] XSS patterns (where applicable)
- [ ] Test templates for popular frameworks

### D6: Custom Category API

**Goal:** Let users define patterns without editing YAML.

**Approaches:**
1. **CLI wizard:** `pinata category create` with prompts
2. **Config file:** `.pinata.yml` with inline patterns
3. **Web UI:** Pattern builder in dashboard (Phase 4)

---

## Priority Order

1. **D1: npm publish** - unblocks everything else
2. **D3: TUI dashboard** - differentiator, impressive demo
3. **D2: Landing page** - marketing presence
4. **D4: VS Code extension** - developer adoption
5. **D5: Language expansion** - broader market
6. **D6: Custom category API** - power users

---

## Non-Goals

- Mobile apps
- GitHub/GitLab native integrations (webhooks)
- SaaS hosted version (requires infra)
- Paid features implementation (just define tiers)

---

## Timeline

| Week | Deliverable |
|------|-------------|
| 1 | D1 (npm), D3 start (TUI) |
| 2 | D3 complete, D2 start (landing) |
| 3 | D2 complete, D4 start (VS Code) |
| 4 | D4 complete, D5 start (languages) |

---

## Dependencies

- `ink` + `ink-spinner` - TUI framework
- `yo` / `generator-code` - VS Code extension scaffold
- Tree-sitter grammars for Go, Java, Rust
