# Changelog

## 0.1.6 (2024-01-20)

### Fixed
- Reduced false positives in memory-bloat pattern (string concat detection)
- Reduced false positives in precision-loss pattern (removed `total` from currency keywords)
- Reduced false positives in timing-attack pattern (more specific comparison matching)
- Changed default confidence level from `low` to `high` for cleaner output

### Added
- Landing page at pinata.sh
- Documentation pages: Getting Started, Categories, How It Works
- Comprehensive docs in `/docs` folder

## 0.1.5 (2024-01-19)

### Fixed
- Category YAML files now included in npm package
- npx caching issues documented

## 0.1.4 (2024-01-19)

### Added
- AI-powered gap explanations via `pinata explain`
- AI-powered test generation via `pinata generate`
- Interactive TUI dashboard via `pinata dashboard`
- Configuration management via `pinata config`
- Go language support (regex patterns)

### Changed
- CLI package renamed to `pinata-security-cli`

## 0.1.0 (2024-01-15)

### Added
- Initial release
- 45 detection categories across 7 risk domains
- Pattern matching for Python, TypeScript, JavaScript
- Multiple output formats: terminal, JSON, SARIF, JUnit, Markdown
- Test template rendering
- CI/CD integration examples
