/**
 * Layer 6: Feedback Store
 * 
 * Persists pattern performance feedback to improve future scans.
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

import type { 
  FeedbackState, 
  PatternFeedback, 
  FeedbackUpdate 
} from "./types.js";
import { 
  EMPTY_FEEDBACK_STATE, 
  suggestConfidence 
} from "./types.js";

/** Feedback store location */
const FEEDBACK_DIR = join(homedir(), ".pinata");
const FEEDBACK_FILE = join(FEEDBACK_DIR, "feedback.json");

/**
 * Load feedback state from disk
 */
export async function loadFeedback(): Promise<FeedbackState> {
  try {
    const content = await readFile(FEEDBACK_FILE, "utf-8");
    const state = JSON.parse(content) as FeedbackState;
    
    // Validate version
    if (state.version !== 1) {
      console.warn("Feedback version mismatch, resetting...");
      return { ...EMPTY_FEEDBACK_STATE };
    }
    
    return state;
  } catch {
    // File doesn't exist or is invalid
    return { ...EMPTY_FEEDBACK_STATE };
  }
}

/**
 * Save feedback state to disk
 */
export async function saveFeedback(state: FeedbackState): Promise<void> {
  try {
    await mkdir(FEEDBACK_DIR, { recursive: true });
    await writeFile(FEEDBACK_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.warn(`Failed to save feedback: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Apply feedback updates to state
 */
export function applyUpdates(
  state: FeedbackState, 
  updates: FeedbackUpdate[]
): FeedbackState {
  const newState = { ...state };
  newState.patterns = { ...state.patterns };
  
  for (const update of updates) {
    const existing = newState.patterns[update.patternId];
    
    const pattern: PatternFeedback = existing ?? {
      patternId: update.patternId,
      categoryId: update.categoryId,
      totalMatches: 0,
      confirmedCount: 0,
      unconfirmedCount: 0,
      aiDismissedCount: 0,
      aiVerifiedCount: 0,
      precision: 0,
      suggestedConfidence: "medium",
      updatedAt: new Date().toISOString(),
    };
    
    // Update counts based on outcome
    switch (update.outcome) {
      case "matched":
        pattern.totalMatches++;
        break;
      case "confirmed":
        pattern.confirmedCount++;
        break;
      case "unconfirmed":
        pattern.unconfirmedCount++;
        break;
      case "ai_verified":
        pattern.aiVerifiedCount++;
        break;
      case "ai_dismissed":
        pattern.aiDismissedCount++;
        break;
    }
    
    // Recalculate precision
    const total = pattern.confirmedCount + pattern.unconfirmedCount;
    pattern.precision = total > 0 
      ? pattern.confirmedCount / total 
      : 0.5; // Default to medium if no dynamic execution data
    
    // Update suggested confidence
    pattern.suggestedConfidence = suggestConfidence(pattern.precision);
    pattern.updatedAt = new Date().toISOString();
    
    newState.patterns[update.patternId] = pattern;
  }
  
  newState.totalScans++;
  newState.lastScanAt = new Date().toISOString();
  
  return newState;
}

/**
 * Get confidence adjustment for a pattern
 * Returns null if no significant feedback data
 */
export function getConfidenceAdjustment(
  state: FeedbackState,
  patternId: string
): "high" | "medium" | "low" | null {
  const pattern = state.patterns[patternId];
  
  if (!pattern) return null;
  
  // Require minimum data points for confidence adjustment
  const totalExecutions = pattern.confirmedCount + pattern.unconfirmedCount;
  if (totalExecutions < 5) return null;
  
  return pattern.suggestedConfidence;
}

/**
 * Get all patterns with low precision (potential false positive sources)
 */
export function getLowPrecisionPatterns(
  state: FeedbackState,
  threshold = 0.3
): PatternFeedback[] {
  return Object.values(state.patterns)
    .filter((p) => {
      const total = p.confirmedCount + p.unconfirmedCount;
      return total >= 5 && p.precision < threshold;
    })
    .sort((a, b) => a.precision - b.precision);
}

/**
 * Get patterns that should have confidence upgraded
 */
export function getHighPrecisionPatterns(
  state: FeedbackState,
  threshold = 0.8
): PatternFeedback[] {
  return Object.values(state.patterns)
    .filter((p) => {
      const total = p.confirmedCount + p.unconfirmedCount;
      return total >= 5 && p.precision >= threshold;
    })
    .sort((a, b) => b.precision - a.precision);
}

/**
 * Generate feedback report
 */
export function generateReport(state: FeedbackState): string {
  const lines: string[] = [
    "# Pinata Feedback Report",
    "",
    `Total scans: ${state.totalScans}`,
    `Last scan: ${state.lastScanAt}`,
    `Patterns tracked: ${Object.keys(state.patterns).length}`,
    "",
  ];
  
  const lowPrecision = getLowPrecisionPatterns(state);
  if (lowPrecision.length > 0) {
    lines.push("## Low Precision Patterns (potential false positive sources)");
    lines.push("");
    for (const p of lowPrecision.slice(0, 10)) {
      lines.push(`- ${p.patternId}: ${(p.precision * 100).toFixed(1)}% precision (${p.confirmedCount}/${p.confirmedCount + p.unconfirmedCount})`);
    }
    lines.push("");
  }
  
  const highPrecision = getHighPrecisionPatterns(state);
  if (highPrecision.length > 0) {
    lines.push("## High Precision Patterns");
    lines.push("");
    for (const p of highPrecision.slice(0, 10)) {
      lines.push(`- ${p.patternId}: ${(p.precision * 100).toFixed(1)}% precision (${p.confirmedCount}/${p.confirmedCount + p.unconfirmedCount})`);
    }
    lines.push("");
  }
  
  return lines.join("\n");
}
