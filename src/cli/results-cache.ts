/**
 * Results cache for storing scan results between analyze and generate commands
 *
 * Stores scan results in .pinata/cache.json for use by the generate command.
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { resolve, dirname } from "path";

import { ok, err } from "../lib/result.js";
import type { Result } from "../lib/result.js";
import { PinataError } from "../lib/errors.js";
import type { ScanResult, Gap } from "../core/scanner/types.js";

/**
 * Cache file location relative to project root
 */
const CACHE_DIR = ".pinata";
const CACHE_FILE = "cache.json";

/**
 * Cached scan result structure (serializable)
 */
export interface CachedScanResult {
  /** When the scan was performed */
  timestamp: string;
  /** Target directory that was scanned */
  targetDirectory: string;
  /** Pinata Score */
  score: number;
  /** Grade */
  grade: string;
  /** Total gaps found */
  totalGaps: number;
  /** The gaps themselves */
  gaps: Gap[];
  /** Categories that were scanned */
  categoriesScanned: string[];
  /** Cache version for compatibility */
  version: number;
}

/**
 * Current cache version - increment when format changes
 */
const CACHE_VERSION = 1;

/**
 * Maximum cache age in milliseconds (1 hour)
 */
const MAX_CACHE_AGE_MS = 60 * 60 * 1000;

/**
 * Get the cache file path for a project
 */
export function getCachePath(projectRoot: string): string {
  return resolve(projectRoot, CACHE_DIR, CACHE_FILE);
}

/**
 * Save scan results to cache
 */
export async function saveScanResults(
  projectRoot: string,
  result: ScanResult
): Promise<Result<void, PinataError>> {
  try {
    const cacheDir = resolve(projectRoot, CACHE_DIR);
    const cachePath = getCachePath(projectRoot);

    // Ensure cache directory exists
    if (!existsSync(cacheDir)) {
      await mkdir(cacheDir, { recursive: true });
    }

    // Create serializable cache object
    const cached: CachedScanResult = {
      timestamp: result.completedAt.toISOString(),
      targetDirectory: result.targetDirectory,
      score: result.score.overall,
      grade: result.score.grade,
      totalGaps: result.gaps.length,
      gaps: result.gaps,
      categoriesScanned: result.categoriesScanned,
      version: CACHE_VERSION,
    };

    await writeFile(cachePath, JSON.stringify(cached, null, 2));

    return ok(undefined);
  } catch (error) {
    return err(
      new PinataError(
        `Failed to save cache: ${error instanceof Error ? error.message : String(error)}`,
        "CACHE_ERROR"
      )
    );
  }
}

/**
 * Load scan results from cache
 */
export async function loadScanResults(
  projectRoot: string
): Promise<Result<CachedScanResult, PinataError>> {
  try {
    const cachePath = getCachePath(projectRoot);

    if (!existsSync(cachePath)) {
      return err(
        new PinataError(
          "No cached scan results found. Run `pinata analyze` first.",
          "CACHE_NOT_FOUND"
        )
      );
    }

    const content = await readFile(cachePath, "utf-8");
    const cached = JSON.parse(content) as CachedScanResult;

    // Check version compatibility
    if (cached.version !== CACHE_VERSION) {
      return err(
        new PinataError(
          "Cache version mismatch. Run `pinata analyze` again.",
          "CACHE_VERSION_MISMATCH"
        )
      );
    }

    // Check cache age
    const cacheAge = Date.now() - new Date(cached.timestamp).getTime();
    if (cacheAge > MAX_CACHE_AGE_MS) {
      return err(
        new PinataError(
          `Cache is stale (${Math.round(cacheAge / 60000)} minutes old). Run \`pinata analyze\` again.`,
          "CACHE_STALE"
        )
      );
    }

    return ok(cached);
  } catch (error) {
    return err(
      new PinataError(
        `Failed to load cache: ${error instanceof Error ? error.message : String(error)}`,
        "CACHE_ERROR"
      )
    );
  }
}

/**
 * Check if cache exists and is valid
 */
export async function isCacheValid(projectRoot: string): Promise<boolean> {
  const result = await loadScanResults(projectRoot);
  return result.success;
}

/**
 * Clear the scan results cache
 */
export async function clearCache(projectRoot: string): Promise<Result<void, PinataError>> {
  try {
    const cachePath = getCachePath(projectRoot);

    if (existsSync(cachePath)) {
      const { unlink } = await import("fs/promises");
      await unlink(cachePath);
    }

    return ok(undefined);
  } catch (error) {
    return err(
      new PinataError(
        `Failed to clear cache: ${error instanceof Error ? error.message : String(error)}`,
        "CACHE_ERROR"
      )
    );
  }
}
