/**
 * Shared CLI utilities
 */

import { existsSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the path to built-in category definitions.
 * Tries multiple locations to support both development and production.
 */
export function getDefinitionsPath(): string {
  const candidates = [
    resolve(__dirname, "../../src/categories/definitions"),
    resolve(process.cwd(), "src/categories/definitions"),
    resolve(__dirname, "../categories/definitions"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0]!;
}
