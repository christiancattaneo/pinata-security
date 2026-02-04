/**
 * Layer 6: Feedback Loop
 * 
 * Tracks pattern performance and adjusts confidence over time.
 */

// Types
export type {
  FeedbackState,
  PatternFeedback,
  FeedbackUpdate,
} from "./types.js";

export {
  EMPTY_FEEDBACK_STATE,
  CONFIDENCE_THRESHOLDS,
  suggestConfidence,
} from "./types.js";

// Store
export {
  loadFeedback,
  saveFeedback,
  applyUpdates,
  getConfidenceAdjustment,
  getLowPrecisionPatterns,
  getHighPrecisionPatterns,
  generateReport,
} from "./store.js";
