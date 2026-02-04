/**
 * Project Type Detection
 * 
 * Detects project type from package.json, file structure, and imports.
 * Used to adjust scoring weights and applicable categories.
 */

import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { resolve } from "path";

// =============================================================================
// PROJECT TYPES
// =============================================================================

export type ProjectType = 
  | "cli"           // Command-line tool
  | "web-server"    // Express, Fastify, Koa, etc.
  | "api"           // REST/GraphQL API
  | "library"       // npm package for consumption
  | "frontend-spa"  // React/Vue/Angular client-only
  | "ssr-framework" // Next.js, Nuxt, Remix
  | "serverless"    // Lambda, Cloud Functions
  | "desktop"       // Electron, Tauri
  | "mobile"        // React Native, Expo
  | "script"        // One-off automation
  | "monorepo"      // Multi-package workspace
  | "unknown";      // Fallback to default rules

export interface ProjectTypeResult {
  /** Primary detected type */
  type: ProjectType;
  /** Confidence in detection */
  confidence: "high" | "medium" | "low";
  /** Evidence that led to detection */
  evidence: string[];
  /** Secondary types (e.g., monorepo containing multiple types) */
  secondaryTypes?: ProjectType[];
  /** Detected frameworks */
  frameworks: string[];
  /** Detected languages */
  languages: string[];
}

// =============================================================================
// DETECTION PATTERNS
// =============================================================================

interface DetectionPattern {
  type: ProjectType;
  /** package.json field checks */
  packageJson?: {
    hasField?: string[];
    fieldContains?: Record<string, string[]>;
    dependencies?: string[];
    devDependencies?: string[];
  };
  /** File/directory existence */
  files?: string[];
  /** Import patterns in code */
  imports?: string[];
  /** Weight for this pattern (higher = more confident) */
  weight: number;
}

const DETECTION_PATTERNS: DetectionPattern[] = [
  // CLI Detection
  {
    type: "cli",
    packageJson: {
      hasField: ["bin"],
    },
    weight: 10,
  },
  {
    type: "cli",
    files: ["src/cli.ts", "src/cli/index.ts", "cli/index.ts"],
    weight: 5,
  },
  {
    type: "cli",
    packageJson: {
      dependencies: ["commander", "yargs", "meow", "oclif", "inquirer", "prompts"],
    },
    weight: 3,
  },

  // Web Server Detection
  {
    type: "web-server",
    packageJson: {
      dependencies: ["express", "fastify", "koa", "hapi", "@hapi/hapi", "restify"],
    },
    weight: 10,
  },
  {
    type: "web-server",
    files: ["server.ts", "server.js", "app.ts", "app.js", "src/server.ts"],
    weight: 3,
  },

  // API Detection
  {
    type: "api",
    files: ["routes/", "handlers/", "controllers/", "api/"],
    weight: 5,
  },
  {
    type: "api",
    files: ["openapi.yaml", "openapi.json", "swagger.yaml", "swagger.json"],
    weight: 8,
  },
  {
    type: "api",
    packageJson: {
      dependencies: ["@nestjs/core", "trpc", "@trpc/server"],
    },
    weight: 10,
  },

  // Library Detection
  {
    type: "library",
    packageJson: {
      hasField: ["exports", "main", "module", "types"],
    },
    weight: 3,
  },
  {
    type: "library",
    files: ["tsup.config.ts", "rollup.config.js", "vite.config.ts"],
    weight: 2,
  },

  // Frontend SPA Detection
  {
    type: "frontend-spa",
    packageJson: {
      dependencies: ["react", "vue", "angular", "svelte", "@angular/core"],
    },
    weight: 5,
  },
  {
    type: "frontend-spa",
    files: ["src/App.tsx", "src/App.vue", "src/app/app.component.ts"],
    weight: 8,
  },

  // SSR Framework Detection
  {
    type: "ssr-framework",
    packageJson: {
      dependencies: ["next", "nuxt", "@nuxt/core", "remix", "@remix-run/node", "astro", "sveltekit"],
    },
    weight: 10,
  },
  {
    type: "ssr-framework",
    files: ["next.config.js", "next.config.ts", "nuxt.config.ts", "remix.config.js", "astro.config.mjs"],
    weight: 10,
  },

  // Serverless Detection
  {
    type: "serverless",
    files: ["serverless.yml", "serverless.yaml", "serverless.ts", "sam.yaml", "template.yaml"],
    weight: 10,
  },
  {
    type: "serverless",
    packageJson: {
      dependencies: ["@aws-sdk/client-lambda", "aws-lambda", "@google-cloud/functions-framework"],
    },
    weight: 5,
  },
  {
    type: "serverless",
    files: ["functions/", "lambda/", "netlify/functions/", "api/"],
    weight: 3,
  },

  // Desktop Detection
  {
    type: "desktop",
    packageJson: {
      dependencies: ["electron", "@electron/remote", "tauri", "@tauri-apps/api"],
    },
    weight: 10,
  },
  {
    type: "desktop",
    files: ["electron/main.ts", "src-tauri/", "electron.js", "main.electron.ts"],
    weight: 8,
  },

  // Mobile Detection
  {
    type: "mobile",
    packageJson: {
      dependencies: ["react-native", "expo", "@react-native-community/cli"],
    },
    weight: 10,
  },
  {
    type: "mobile",
    files: ["app.json", "metro.config.js", "ios/", "android/"],
    weight: 5,
  },

  // Monorepo Detection
  {
    type: "monorepo",
    packageJson: {
      hasField: ["workspaces"],
    },
    weight: 10,
  },
  {
    type: "monorepo",
    files: ["lerna.json", "pnpm-workspace.yaml", "turbo.json", "nx.json"],
    weight: 10,
  },
  {
    type: "monorepo",
    files: ["packages/", "apps/"],
    weight: 5,
  },

  // Script Detection (low weight, fallback)
  {
    type: "script",
    files: ["script.ts", "script.js", "run.ts", "run.js"],
    weight: 2,
  },
];

// =============================================================================
// SCORING ADJUSTMENTS
// =============================================================================

/** Categories that should be weighted differently per project type */
export interface ScoringAdjustment {
  /** Category ID */
  categoryId: string;
  /** Project types where this is less relevant (lower weight) */
  lowerWeight?: ProjectType[];
  /** Project types where this is more relevant (higher weight) */
  higherWeight?: ProjectType[];
  /** Project types where this should be skipped entirely */
  skip?: ProjectType[];
}

export const SCORING_ADJUSTMENTS: ScoringAdjustment[] = [
  // Blocking I/O is fine in CLI and scripts
  {
    categoryId: "blocking-io",
    skip: ["cli", "script", "desktop"],
    lowerWeight: ["serverless"],
  },
  // SQL injection not relevant for pure frontends
  {
    categoryId: "sql-injection",
    skip: ["frontend-spa", "mobile"],
    higherWeight: ["web-server", "api"],
  },
  // XSS is critical for frontends, less so for pure APIs
  {
    categoryId: "xss",
    higherWeight: ["frontend-spa", "ssr-framework"],
    lowerWeight: ["api", "cli"],
  },
  // SSRF is critical for servers
  {
    categoryId: "ssrf",
    skip: ["frontend-spa", "cli", "script"],
    higherWeight: ["web-server", "api", "serverless"],
  },
  // Connection pool exhaustion not relevant for serverless
  {
    categoryId: "connection-pool-exhaustion",
    skip: ["serverless", "frontend-spa", "cli"],
    higherWeight: ["web-server", "api"],
  },
  // Memory leaks are critical for long-running servers
  {
    categoryId: "memory-leak",
    skip: ["serverless", "script"],
    higherWeight: ["web-server", "desktop"],
  },
  // Rate limiting not needed for CLI
  {
    categoryId: "rate-limiting",
    skip: ["cli", "script", "library"],
    higherWeight: ["web-server", "api"],
  },
  // CSRF not relevant for CLI or pure APIs
  {
    categoryId: "csrf",
    skip: ["cli", "script", "library", "api"],
    higherWeight: ["web-server", "ssr-framework"],
  },
  // Deserialization critical for APIs, less so for frontends
  {
    categoryId: "deserialization",
    skip: ["frontend-spa"],
    higherWeight: ["api", "web-server"],
  },
  // Command injection critical for servers, OK in CLI
  {
    categoryId: "command-injection",
    lowerWeight: ["cli", "script"],
    higherWeight: ["web-server", "api", "serverless"],
  },
];

// =============================================================================
// DETECTION FUNCTIONS
// =============================================================================

/**
 * Detect project type from directory
 */
export async function detectProjectType(projectPath: string): Promise<ProjectTypeResult> {
  const scores = new Map<ProjectType, number>();
  const evidence: string[] = [];
  const frameworks: string[] = [];
  
  // Load package.json if exists
  const packageJsonPath = resolve(projectPath, "package.json");
  let packageJson: Record<string, unknown> | null = null;
  
  if (existsSync(packageJsonPath)) {
    try {
      const content = await readFile(packageJsonPath, "utf-8");
      packageJson = JSON.parse(content) as Record<string, unknown>;
    } catch {
      // Ignore parse errors
    }
  }
  
  // Apply detection patterns
  for (const pattern of DETECTION_PATTERNS) {
    let matched = false;
    
    // Check package.json patterns
    if (pattern.packageJson && packageJson) {
      // Check hasField
      if (pattern.packageJson.hasField) {
        for (const field of pattern.packageJson.hasField) {
          if (field in packageJson) {
            matched = true;
            evidence.push(`package.json has "${field}" field`);
          }
        }
      }
      
      // Check dependencies
      if (pattern.packageJson.dependencies) {
        const deps = packageJson["dependencies"] as Record<string, string> | undefined;
        if (deps) {
          for (const dep of pattern.packageJson.dependencies) {
            if (dep in deps) {
              matched = true;
              evidence.push(`Uses ${dep}`);
              frameworks.push(dep);
            }
          }
        }
      }
      
      // Check devDependencies
      if (pattern.packageJson.devDependencies) {
        const devDeps = packageJson["devDependencies"] as Record<string, string> | undefined;
        if (devDeps) {
          for (const dep of pattern.packageJson.devDependencies) {
            if (dep in devDeps) {
              matched = true;
              evidence.push(`Uses ${dep} (dev)`);
            }
          }
        }
      }
    }
    
    // Check file patterns
    if (pattern.files) {
      for (const file of pattern.files) {
        const filePath = resolve(projectPath, file);
        if (existsSync(filePath)) {
          matched = true;
          evidence.push(`Has ${file}`);
        }
      }
    }
    
    // Apply weight
    if (matched) {
      const current = scores.get(pattern.type) ?? 0;
      scores.set(pattern.type, current + pattern.weight);
    }
  }
  
  // Find highest scoring type
  let bestType: ProjectType = "unknown";
  let bestScore = 0;
  
  for (const [type, score] of scores.entries()) {
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }
  
  // Determine confidence
  let confidence: "high" | "medium" | "low" = "low";
  if (bestScore >= 10) {
    confidence = "high";
  } else if (bestScore >= 5) {
    confidence = "medium";
  }
  
  // Collect secondary types (for monorepos)
  const secondaryTypes: ProjectType[] = [];
  if (bestType === "monorepo") {
    for (const [type, score] of scores.entries()) {
      if (type !== "monorepo" && score >= 3) {
        secondaryTypes.push(type);
      }
    }
  }
  
  // Detect languages
  const languages: string[] = [];
  if (existsSync(resolve(projectPath, "tsconfig.json"))) languages.push("typescript");
  if (existsSync(resolve(projectPath, "package.json"))) languages.push("javascript");
  if (existsSync(resolve(projectPath, "requirements.txt"))) languages.push("python");
  if (existsSync(resolve(projectPath, "go.mod"))) languages.push("go");
  if (existsSync(resolve(projectPath, "Cargo.toml"))) languages.push("rust");
  if (existsSync(resolve(projectPath, "pom.xml"))) languages.push("java");
  
  const result: ProjectTypeResult = {
    type: bestType,
    confidence,
    evidence: [...new Set(evidence)],
    frameworks: [...new Set(frameworks)],
    languages,
  };
  
  // Only add secondaryTypes if present (for exactOptionalPropertyTypes)
  if (secondaryTypes.length > 0) {
    result.secondaryTypes = secondaryTypes;
  }
  
  return result;
}

/**
 * Check if a category should be skipped for a project type
 */
export function shouldSkipCategory(categoryId: string, projectType: ProjectType): boolean {
  const adjustment = SCORING_ADJUSTMENTS.find(a => a.categoryId === categoryId);
  if (!adjustment) return false;
  return adjustment.skip?.includes(projectType) ?? false;
}

/**
 * Get weight multiplier for a category based on project type
 */
export function getCategoryWeight(categoryId: string, projectType: ProjectType): number {
  const adjustment = SCORING_ADJUSTMENTS.find(a => a.categoryId === categoryId);
  if (!adjustment) return 1.0;
  
  if (adjustment.skip?.includes(projectType)) return 0;
  if (adjustment.higherWeight?.includes(projectType)) return 1.5;
  if (adjustment.lowerWeight?.includes(projectType)) return 0.5;
  
  return 1.0;
}

/**
 * Get human-readable description of project type
 */
export function getProjectTypeDescription(type: ProjectType): string {
  const descriptions: Record<ProjectType, string> = {
    "cli": "Command-line tool",
    "web-server": "Web server (Express, Fastify, etc.)",
    "api": "REST/GraphQL API",
    "library": "Library/package for consumption",
    "frontend-spa": "Frontend single-page application",
    "ssr-framework": "Server-side rendering framework",
    "serverless": "Serverless function",
    "desktop": "Desktop application",
    "mobile": "Mobile application",
    "script": "Script/automation",
    "monorepo": "Monorepo workspace",
    "unknown": "Unknown project type",
  };
  
  return descriptions[type];
}
