# Contributing to Pinata

Thank you for contributing to Pinata.

## Getting Started

```bash
# Clone the repository
git clone https://github.com/christiancattaneo/pinata-security.git
cd pinata-security

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run the CLI locally
node dist/cli/index.js analyze .
```

## Project Structure

```
pinata/
├── src/
│   ├── categories/          # Category definitions and store
│   │   ├── definitions/     # YAML category files
│   │   ├── schema/          # Zod schemas
│   │   ├── store/           # CategoryStore implementation
│   │   └── migrations/      # Category migrations
│   ├── core/                # Core analysis engine
│   │   ├── scanner/         # File scanning
│   │   └── matcher/         # Pattern matching
│   ├── cli/                 # CLI implementation
│   │   ├── commands/        # Command handlers
│   │   └── tui/             # Terminal UI (ink)
│   ├── ai/                  # AI service integration
│   ├── templates/           # Test template rendering
│   └── lib/                 # Shared utilities
├── tests/                   # Test files
│   ├── unit/                # Unit tests
│   ├── integration/         # Integration tests
│   ├── corpus/              # Detection accuracy tests
│   └── fixtures/            # Test fixtures
├── docs/                    # Documentation
└── apps/
    ├── web/                 # Landing page
    └── vscode/              # VS Code extension
```

## Development Workflow

### Making Changes

1. Create a feature branch
   ```bash
   git checkout -b feature/my-feature
   ```

2. Make your changes

3. Run linting and type checking
   ```bash
   npm run lint
   npm run typecheck
   ```

4. Run tests
   ```bash
   npm test
   ```

5. Build to verify
   ```bash
   npm run build
   ```

6. Commit and push
   ```bash
   git add .
   git commit -m "Add feature X"
   git push origin feature/my-feature
   ```

7. Open a pull request

### Code Style

- TypeScript with strict mode
- ESLint + Prettier for formatting
- Zod for runtime validation
- Explicit return types on public functions
- No `any` types (use `unknown` and narrow)

Run formatting:
```bash
npm run format
```

### Testing

**Run all tests**
```bash
npm test
```

**Run specific tests**
```bash
npm test -- --grep "Scanner"
```

**Run with coverage**
```bash
npm run test:coverage
```

### Test Guidelines

Write tests that challenge the code:
- Edge cases (empty inputs, max values, unicode)
- Error conditions
- Concurrent access
- Large inputs

```typescript
describe('Scanner', () => {
  it('handles empty directory', async () => {
    const result = await scanner.scan(emptyDir);
    expect(result.gaps).toEqual([]);
    expect(result.score).toBe(100);
  });

  it('handles file with no read permission', async () => {
    await expect(scanner.scan(unreadableFile))
      .rejects.toThrow(/permission/i);
  });

  it('handles deeply nested directories', async () => {
    // 50 levels deep
    const result = await scanner.scan(deeplyNestedDir);
    expect(result.filesScanned).toBeGreaterThan(0);
  });
});
```

## Adding Detection Categories

See [Authoring Categories](./authoring-categories.md) for the complete guide.

### Quick Steps

1. Create YAML file in `src/categories/definitions/<domain>/`
2. Define patterns with appropriate confidence levels
3. Add test templates
4. Include examples with vulnerable and safe code
5. Test against real code
6. Run category validation: `npm run validate:categories`

## Pull Request Guidelines

### PR Title

Use conventional commits format:
- `feat: add Go language support`
- `fix: reduce false positives in sql-injection`
- `docs: add API reference`
- `refactor: simplify pattern matching`
- `test: add corpus tests for XSS`

### PR Description

Include:
- What the PR does
- Why the change is needed
- How to test it
- Any breaking changes

### Review Checklist

Before requesting review:
- [ ] Tests pass locally
- [ ] Linting passes
- [ ] Build succeeds
- [ ] Documentation updated if needed
- [ ] No new `any` types
- [ ] Error handling for edge cases

## Reporting Issues

### Bug Reports

Include:
- Pinata version (`pinata --version`)
- Node.js version (`node --version`)
- Operating system
- Steps to reproduce
- Expected behavior
- Actual behavior
- Error messages or logs

### Feature Requests

Describe:
- The problem you're trying to solve
- Proposed solution
- Alternatives considered
- Any relevant context

### Security Issues

For security vulnerabilities, please email directly instead of opening a public issue. Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix if any

## Adding Language Support

To add a new language:

1. **Update Language schema**
   ```typescript
   // src/categories/schema/category.schema.ts
   export const LanguageSchema = z.enum([
     'python', 'typescript', 'javascript', 'go', 'rust'  // Add new
   ]);
   ```

2. **Add file extension mapping**
   ```typescript
   // src/core/scanner/file-utils.ts
   const LANGUAGE_EXTENSIONS = {
     '.rs': 'rust',
     // ...
   };
   ```

3. **Create detection patterns**
   Add patterns for each category that applies to the new language.

4. **Add test templates**
   Create templates for the language's test frameworks.

5. **Add corpus tests**
   Create vulnerable and safe code samples for accuracy testing.

## Release Process

Releases are handled by maintainers:

1. Update version in `package.json` and `src/core/index.ts`
2. Update CHANGELOG
3. Create git tag: `git tag v0.1.7`
4. Push: `git push && git push --tags`
5. Publish: `npm publish --access public`

## Questions

- Open a GitHub Discussion for general questions
- Check existing issues before opening new ones
- Join the community for real-time help

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
