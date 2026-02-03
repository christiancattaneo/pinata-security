# API Reference

Programmatic usage of Pinata in Node.js/TypeScript.

## Installation

```bash
npm install pinata-security-cli
```

## Basic Usage

```typescript
import { Scanner, CategoryStore } from 'pinata-security-cli';

async function scan() {
  // Load categories
  const store = new CategoryStore();
  await store.loadAll();

  // Create scanner
  const scanner = new Scanner(store);

  // Run scan
  const result = await scanner.scan('./src');

  console.log(`Score: ${result.score}/100 (${result.grade})`);
  console.log(`Gaps found: ${result.gaps.length}`);
}

scan();
```

## Scanner

The main entry point for scanning.

### Constructor

```typescript
import { Scanner, CategoryStore } from 'pinata-security-cli';

const store = new CategoryStore();
await store.loadAll();

const scanner = new Scanner(store, options);
```

**Options**

```typescript
interface ScannerOptions {
  excludeDirs?: string[];      // Directories to exclude
  minConfidence?: Confidence;  // 'high' | 'medium' | 'low'
  domains?: RiskDomain[];      // Filter by domains
  verbose?: boolean;           // Enable verbose logging
}
```

### scan()

Scan a directory or file.

```typescript
const result = await scanner.scan(path: string): Promise<ScanResult>;
```

**ScanResult**

```typescript
interface ScanResult {
  targetDirectory: string;
  scanTime: Date;
  score: number;           // 0-100
  grade: Grade;            // 'A' | 'B' | 'C' | 'D' | 'F'
  gaps: Gap[];
  coverage: CoverageResult;
  filesScanned: number;
  categoriesScanned: string[];
  scanDurationMs: number;
}
```

### Gap

```typescript
interface Gap {
  categoryId: string;
  categoryName: string;
  domain: RiskDomain;
  level: TestLevel;
  priority: Priority;
  severity: Severity;
  confidence: Confidence;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  columnStart: number;
  columnEnd: number;
  codeSnippet: string;
  patternId: string;
  patternType: PatternType;
  priorityScore: number;
}
```

## CategoryStore

Manages detection categories.

### Constructor

```typescript
import { CategoryStore } from 'pinata-security-cli';

const store = new CategoryStore(customPath?: string);
```

### loadAll()

Load all built-in categories.

```typescript
await store.loadAll(): Promise<void>;
```

### loadFromDirectory()

Load categories from a custom directory.

```typescript
await store.loadFromDirectory(path: string): Promise<void>;
```

### getCategory()

Get a category by ID.

```typescript
const category = store.getCategory(id: string): Category | undefined;
```

### getAllCategories()

Get all loaded categories.

```typescript
const categories = store.getAllCategories(): Category[];
```

### getByDomain()

Get categories filtered by risk domain.

```typescript
const securityCategories = store.getByDomain('security'): Category[];
```

## Category

```typescript
interface Category {
  id: string;
  version: number;
  name: string;
  description: string;
  domain: RiskDomain;
  level: TestLevel;
  priority: Priority;
  severity: Severity;
  applicableLanguages: Language[];
  detectionPatterns: DetectionPattern[];
  testTemplates: TestTemplate[];
  examples: Example[];
  cves?: string[];
  references?: string[];
}
```

## PatternMatcher

Low-level pattern matching.

```typescript
import { PatternMatcher } from 'pinata-security-cli';

const matcher = new PatternMatcher();

const matches = await matcher.matchFile(
  filePath: string,
  content: string,
  patterns: DetectionPattern[]
): Promise<PatternMatch[]>;
```

## AIService

AI-powered features (requires API key).

### Constructor

```typescript
import { AIService } from 'pinata-security-cli';

const ai = new AIService({
  provider: 'anthropic',  // or 'openai'
  // API key from env or config
});
```

### explainGap()

Get AI explanation for a gap.

```typescript
const explanation = await ai.explainGap(gap: Gap): Promise<GapExplanation>;
```

**GapExplanation**

```typescript
interface GapExplanation {
  summary: string;
  explanation: string;
  risk: string;
  remediation: string;
  safeExample?: string;
  references: string[];
}
```

### generateTest()

Generate test for a gap.

```typescript
const test = await ai.generateTest(
  gap: Gap,
  template: TestTemplate
): Promise<GeneratedTest>;
```

**GeneratedTest**

```typescript
interface GeneratedTest {
  code: string;
  framework: string;
  language: string;
  filePath: string;
}
```

## TemplateRenderer

Render test templates with variables.

```typescript
import { TemplateRenderer } from 'pinata-security-cli';

const renderer = new TemplateRenderer();

const code = await renderer.render(
  template: TestTemplate,
  variables: Record<string, unknown>
): Promise<string>;
```

## Types

### RiskDomain

```typescript
type RiskDomain = 
  | 'security'
  | 'data'
  | 'concurrency'
  | 'input'
  | 'resource'
  | 'reliability'
  | 'performance';
```

### Severity

```typescript
type Severity = 'critical' | 'high' | 'medium' | 'low';
```

### Confidence

```typescript
type Confidence = 'high' | 'medium' | 'low';
```

### Priority

```typescript
type Priority = 'P0' | 'P1' | 'P2';
```

### Language

```typescript
type Language = 'python' | 'typescript' | 'javascript' | 'go';
```

### Grade

```typescript
type Grade = 'A' | 'B' | 'C' | 'D' | 'F';
```

## Error Handling

Pinata exports custom error classes:

```typescript
import { 
  PinataError,
  ValidationError,
  ParseError,
  ConfigError,
  AnalysisError
} from 'pinata-security-cli';

try {
  await scanner.scan('./src');
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Invalid input:', error.message);
  } else if (error instanceof ParseError) {
    console.error('Parse error in', error.filePath);
  } else {
    throw error;
  }
}
```

## Events

Scanner emits events for progress tracking:

```typescript
scanner.on('file:start', (filePath: string) => {
  console.log(`Scanning: ${filePath}`);
});

scanner.on('file:complete', (filePath: string, gapCount: number) => {
  console.log(`${filePath}: ${gapCount} gaps`);
});

scanner.on('category:loaded', (category: Category) => {
  console.log(`Loaded: ${category.name}`);
});

scanner.on('scan:complete', (result: ScanResult) => {
  console.log(`Done: ${result.score}/100`);
});
```

## Example: Custom Reporter

```typescript
import { Scanner, CategoryStore, Gap } from 'pinata-security-cli';

async function customReport() {
  const store = new CategoryStore();
  await store.loadAll();

  const scanner = new Scanner(store);
  const result = await scanner.scan('./src');

  // Group gaps by file
  const byFile = new Map<string, Gap[]>();
  for (const gap of result.gaps) {
    const gaps = byFile.get(gap.filePath) || [];
    gaps.push(gap);
    byFile.set(gap.filePath, gaps);
  }

  // Generate custom report
  console.log('# Security Report\n');
  console.log(`Score: ${result.score}/100\n`);

  for (const [file, gaps] of byFile) {
    console.log(`## ${file}\n`);
    for (const gap of gaps) {
      console.log(`- **${gap.categoryName}** (line ${gap.lineStart})`);
      console.log(`  Severity: ${gap.severity}`);
    }
    console.log('');
  }
}

customReport();
```

## Example: CI Integration

```typescript
import { Scanner, CategoryStore } from 'pinata-security-cli';

async function ciCheck() {
  const store = new CategoryStore();
  await store.loadAll();

  const scanner = new Scanner(store, {
    minConfidence: 'high',
    domains: ['security']
  });

  const result = await scanner.scan('./src');

  // Check for critical gaps
  const criticalGaps = result.gaps.filter(g => g.severity === 'critical');

  if (criticalGaps.length > 0) {
    console.error(`Found ${criticalGaps.length} critical gaps:`);
    for (const gap of criticalGaps) {
      console.error(`  - ${gap.categoryName}: ${gap.filePath}:${gap.lineStart}`);
    }
    process.exit(1);
  }

  console.log('No critical security gaps found.');
  process.exit(0);
}

ciCheck();
```
