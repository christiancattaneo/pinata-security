#!/usr/bin/env npx ts-node
/**
 * Fetches security advisories from GitHub's API to discover new vulnerability patterns.
 *
 * Usage:
 *   npx ts-node scripts/fetch-github-advisories.ts [--cwe=89] [--ecosystem=npm] [--severity=critical]
 *
 * This script:
 * 1. Queries GitHub's Security Advisory API
 * 2. Extracts CVE/CWE information and affected packages
 * 3. Finds fixing commits where available
 * 4. Outputs data for pattern analysis
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";

const API_BASE = "https://api.github.com/advisories";
const OUTPUT_DIR = ".pinata/cache/advisories";
const CACHE_FILE = join(OUTPUT_DIR, "advisory-cache.json");

// CWE to Pinata category mapping
const CWE_CATEGORY_MAP: Record<number, string> = {
  89: "sql-injection",
  79: "xss",
  78: "command-injection",
  22: "path-traversal",
  918: "ssrf",
  611: "xxe",
  502: "deserialization",
  798: "hardcoded-secrets",
  352: "csrf",
  94: "code-injection",
};

interface Advisory {
  ghsa_id: string;
  cve_id: string | null;
  summary: string;
  description: string;
  severity: string;
  cwes: Array<{ cwe_id: string; name: string }>;
  references: Array<{ url: string }>;
  vulnerabilities: Array<{
    package: {
      ecosystem: string;
      name: string;
    };
    vulnerable_version_range: string;
    first_patched_version: string | null;
  }>;
  published_at: string;
}

interface ParsedAdvisory {
  id: string;
  cve: string | null;
  summary: string;
  severity: string;
  cwes: number[];
  categories: string[];
  packages: string[];
  ecosystem: string;
  fixCommits: string[];
  publishedAt: string;
}

async function fetchAdvisories(params: {
  cwe?: number;
  ecosystem?: string;
  severity?: string;
  perPage?: number;
}): Promise<Advisory[]> {
  const searchParams = new URLSearchParams();

  if (params.cwe) {
    searchParams.set("cwe", `CWE-${params.cwe}`);
  }
  if (params.ecosystem) {
    searchParams.set("ecosystem", params.ecosystem);
  }
  if (params.severity) {
    searchParams.set("severity", params.severity);
  }
  searchParams.set("per_page", String(params.perPage ?? 100));
  searchParams.set("type", "reviewed");

  const url = `${API_BASE}?${searchParams.toString()}`;
  console.log(`Fetching: ${url}`);

  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<Advisory[]>;
}

function extractCommitUrls(advisory: Advisory): string[] {
  const commits: string[] = [];

  if (!advisory.references) return commits;

  for (const ref of advisory.references) {
    const url = ref?.url;
    if (!url) continue;

    // Match commit URLs
    if (url.includes("/commit/")) {
      commits.push(url);
    }
    // Match PR URLs (often contain fix)
    if (url.includes("/pull/")) {
      commits.push(url);
    }
  }

  return commits;
}

function parseAdvisory(advisory: Advisory): ParsedAdvisory {
  const cwes = advisory.cwes.map((c) => {
    const match = c.cwe_id.match(/CWE-(\d+)/);
    return match ? parseInt(match[1]!, 10) : 0;
  }).filter((n) => n > 0);

  const categories = cwes
    .map((cwe) => CWE_CATEGORY_MAP[cwe])
    .filter((c): c is string => c !== undefined);

  const packages = advisory.vulnerabilities.map((v) => v.package.name);
  const ecosystem = advisory.vulnerabilities[0]?.package.ecosystem ?? "unknown";

  return {
    id: advisory.ghsa_id,
    cve: advisory.cve_id,
    summary: advisory.summary,
    severity: advisory.severity,
    cwes,
    categories: [...new Set(categories)],
    packages,
    ecosystem,
    fixCommits: extractCommitUrls(advisory),
    publishedAt: advisory.published_at,
  };
}

function loadCache(): Map<string, ParsedAdvisory> {
  if (!existsSync(CACHE_FILE)) {
    return new Map();
  }

  try {
    const data = JSON.parse(readFileSync(CACHE_FILE, "utf-8")) as ParsedAdvisory[];
    return new Map(data.map((a) => [a.id, a]));
  } catch {
    return new Map();
  }
}

function saveCache(advisories: Map<string, ParsedAdvisory>): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify([...advisories.values()], null, 2));
}

async function main(): Promise<void> {
  console.log("=== GitHub Advisory Fetcher ===\n");

  // Parse CLI args
  const args = process.argv.slice(2);
  const params: { cwe?: number; ecosystem?: string; severity?: string } = {};

  for (const arg of args) {
    const [key, value] = arg.replace("--", "").split("=");
    if (key === "cwe" && value) params.cwe = parseInt(value, 10);
    if (key === "ecosystem" && value) params.ecosystem = value;
    if (key === "severity" && value) params.severity = value;
  }

  // Load existing cache
  const cache = loadCache();
  console.log(`Loaded ${cache.size} cached advisories\n`);

  // Fetch advisories for key CWEs if no specific CWE requested
  const cwesToFetch = params.cwe ? [params.cwe] : [89, 79, 78, 22, 918, 502];

  const ecosystems = params.ecosystem ? [params.ecosystem] : ["npm", "pip"];

  let newCount = 0;

  for (const ecosystem of ecosystems) {
    for (const cwe of cwesToFetch) {
      try {
        const advisories = await fetchAdvisories({
          cwe,
          ecosystem,
          severity: params.severity,
          perPage: 50,
        });

        for (const advisory of advisories) {
          if (!cache.has(advisory.ghsa_id)) {
            const parsed = parseAdvisory(advisory);
            cache.set(parsed.id, parsed);
            newCount++;

            console.log(`  [NEW] ${parsed.id}: ${parsed.summary.slice(0, 60)}...`);
            if (parsed.fixCommits.length > 0) {
              console.log(`         Fix: ${parsed.fixCommits[0]}`);
            }
          }
        }

        // Rate limit: 60 requests/hour for unauthenticated
        await new Promise((r) => setTimeout(r, 1000));
      } catch (err) {
        console.error(`Error fetching CWE-${cwe} for ${ecosystem}:`, (err as Error).message);
      }
    }
  }

  // Save updated cache
  saveCache(cache);

  // Generate summary
  console.log("\n=== Summary ===");
  console.log(`Total advisories: ${cache.size}`);
  console.log(`New this run: ${newCount}`);

  // Group by category
  const byCategory = new Map<string, ParsedAdvisory[]>();
  for (const advisory of cache.values()) {
    for (const category of advisory.categories) {
      const existing = byCategory.get(category) ?? [];
      existing.push(advisory);
      byCategory.set(category, existing);
    }
  }

  console.log("\nBy category:");
  for (const [category, advisories] of byCategory) {
    const withFixes = advisories.filter((a) => a.fixCommits.length > 0).length;
    console.log(`  ${category}: ${advisories.length} total, ${withFixes} with fix commits`);
  }

  // Output advisories with fix commits for pattern analysis
  const withFixes = [...cache.values()].filter((a) => a.fixCommits.length > 0);
  const fixesFile = join(OUTPUT_DIR, "advisories-with-fixes.json");
  writeFileSync(fixesFile, JSON.stringify(withFixes, null, 2));
  console.log(`\nAdvisories with fix commits: ${fixesFile}`);

  // Output by category for easy access
  for (const [category, advisories] of byCategory) {
    const categoryFile = join(OUTPUT_DIR, `${category}-advisories.json`);
    writeFileSync(categoryFile, JSON.stringify(advisories, null, 2));
  }

  console.log("\nDone! Use fix commits to analyze vulnerable vs. patched code patterns.");
}

main().catch(console.error);
