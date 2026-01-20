#!/usr/bin/env npx tsx
/**
 * Test script for tree-sitter setup
 */

async function main(): Promise<void> {
  const { checkTreeSitterSetup, createAstMatcher } = await import("../src/core/detection/ast-parser.js");
  
  console.log("Checking tree-sitter setup...\n");
  
  const result = await checkTreeSitterSetup();
  console.log("Setup result:", JSON.stringify(result, null, 2));
  
  if (result.success && result.data.ready) {
    console.log("\nTree-sitter is ready!");
    console.log("Available languages:", result.data.languages.join(", "));
    
    // Try a simple parse
    const matcher = createAstMatcher();
    const source = `
def hello():
    print("Hello, world!")
`;
    const parseResult = await matcher.parse(source, "python");
    console.log("\nPython parse result:", parseResult.success ? "SUCCESS" : "FAILED");
    
    if (parseResult.success) {
      // Try a query
      const queryResult = await matcher.query(source, "(function_definition name: (identifier) @name) @func", "python");
      console.log("Query result:", queryResult.success ? `Found ${queryResult.data?.length ?? 0} matches` : "FAILED");
    }
  } else {
    console.log("\nTree-sitter is NOT ready.");
    console.log("Run: npm run setup:wasm");
  }
}

main().catch(console.error);
