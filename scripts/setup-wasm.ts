#!/usr/bin/env npx tsx
/**
 * Setup script for downloading tree-sitter WASM files
 *
 * Downloads pre-built WASM files for tree-sitter language parsers.
 * These are required for AST pattern matching.
 *
 * Usage: npx tsx scripts/setup-wasm.ts
 */

import { writeFile, mkdir, copyFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

const WASM_DIR = join(process.cwd(), "wasm");

// URLs for pre-built WASM files from tree-sitter releases
// These are the official WASM builds compatible with web-tree-sitter
const WASM_URLS: Record<string, string> = {
  // tree-sitter-python from NPM package
  "tree-sitter-python.wasm":
    "https://unpkg.com/tree-sitter-python@0.23.6/tree-sitter-python.wasm",
  // tree-sitter-javascript from NPM package
  "tree-sitter-javascript.wasm":
    "https://unpkg.com/tree-sitter-javascript@0.23.1/tree-sitter-javascript.wasm",
  // tree-sitter-typescript from NPM package (typescript grammar)
  "tree-sitter-typescript.wasm":
    "https://unpkg.com/tree-sitter-typescript@0.23.2/tree-sitter-typescript.wasm",
};

// Path to web-tree-sitter.wasm in node_modules
const WEB_TREE_SITTER_WASM = join(
  process.cwd(),
  "node_modules/web-tree-sitter/web-tree-sitter.wasm"
);

async function downloadFile(url: string, destPath: string): Promise<void> {
  console.log(`Downloading ${url}...`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  await writeFile(destPath, Buffer.from(buffer));
  console.log(`  -> Saved to ${destPath}`);
}

async function main(): Promise<void> {
  console.log("Setting up tree-sitter WASM files...\n");

  // Create wasm directory if it doesn't exist
  if (!existsSync(WASM_DIR)) {
    await mkdir(WASM_DIR, { recursive: true });
    console.log(`Created directory: ${WASM_DIR}\n`);
  }

  // Download each WASM file
  const results: { file: string; success: boolean; error?: string }[] = [];

  for (const [filename, url] of Object.entries(WASM_URLS)) {
    const destPath = join(WASM_DIR, filename);

    // Skip if already exists
    if (existsSync(destPath)) {
      console.log(`Skipping ${filename} (already exists)`);
      results.push({ file: filename, success: true });
      continue;
    }

    try {
      await downloadFile(url, destPath);
      results.push({ file: filename, success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to download ${filename}: ${message}`);
      results.push({ file: filename, success: false, error: message });
    }
  }

  // Copy web-tree-sitter.wasm from node_modules
  const webTreeSitterDest = join(WASM_DIR, "web-tree-sitter.wasm");
  if (!existsSync(webTreeSitterDest)) {
    if (existsSync(WEB_TREE_SITTER_WASM)) {
      console.log("\nCopying web-tree-sitter.wasm from node_modules...");
      await copyFile(WEB_TREE_SITTER_WASM, webTreeSitterDest);
      console.log(`  -> Copied to ${webTreeSitterDest}`);
    } else {
      console.warn("\nWarning: web-tree-sitter.wasm not found in node_modules");
      console.warn("Run: npm install web-tree-sitter");
    }
  } else {
    console.log("\nSkipping web-tree-sitter.wasm (already exists)");
  }

  // Summary
  console.log("\n--- Summary ---");
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`Downloaded: ${succeeded}/${results.length} language grammars`);

  if (failed > 0) {
    console.log(`\nFailed downloads:`);
    for (const r of results.filter((r) => !r.success)) {
      console.log(`  - ${r.file}: ${r.error}`);
    }
    console.log("\nYou can manually download these files from:");
    console.log("  https://github.com/AstParsers/tree-sitter-wasm");
    process.exit(1);
  }

  console.log("\nTree-sitter WASM setup complete!");
  console.log("AST pattern matching is now available for: Python, TypeScript, JavaScript");
}

main().catch((error) => {
  console.error("Setup failed:", error);
  process.exit(1);
});
