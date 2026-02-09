/**
 * Test generation module
 *
 * Generates runnable adversarial security tests from vulnerability findings.
 * Uses AI to create complete test files (not templates) that:
 * - Fail against vulnerable code (proving the vulnerability exists)
 * - Pass after the code is fixed (regression gate)
 * - Target the specific vulnerable code path with real payloads
 */

export {
  extractTestContext,
  extractTestContexts,
  type TestContext,
  type TestFramework,
} from "./context.js";

export {
  generateTest,
  generatePropertyTest,
  type GeneratedTest,
  type GenerationResult,
} from "./generator.js";

export {
  validateTest,
  cleanupTest,
  type ValidationResult,
} from "./validator.js";
