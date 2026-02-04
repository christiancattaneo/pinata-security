/**
 * Layer 6: Feedback Loop Types
 * 
 * Types for tracking pattern performance and adjusting confidence.
 */

/** Pattern feedback record */
export interface PatternFeedback {
  /** Pattern ID */
  patternId: string;
  /** Category ID */
  categoryId: string;
  /** Total times this pattern matched */
  totalMatches: number;
  /** Times match was confirmed by dynamic execution */
  confirmedCount: number;
  /** Times match was NOT confirmed (false positive) */
  unconfirmedCount: number;
  /** Times match was dismissed by AI verification */
  aiDismissedCount: number;
  /** Times match was verified by AI */
  aiVerifiedCount: number;
  /** Calculated precision: confirmed / (confirmed + unconfirmed) */
  precision: number;
  /** Suggested confidence adjustment */
  suggestedConfidence: "high" | "medium" | "low";
  /** Last updated timestamp */
  updatedAt: string;
}

/** Feedback store state */
export interface FeedbackState {
  /** Version of the feedback format */
  version: number;
  /** Pattern feedback records keyed by patternId */
  patterns: Record<string, PatternFeedback>;
  /** Total scans contributing to feedback */
  totalScans: number;
  /** Last scan timestamp */
  lastScanAt: string;
}

/** Default empty state */
export const EMPTY_FEEDBACK_STATE: FeedbackState = {
  version: 1,
  patterns: {},
  totalScans: 0,
  lastScanAt: new Date().toISOString(),
};

/** Feedback update from a scan */
export interface FeedbackUpdate {
  /** Pattern ID */
  patternId: string;
  /** Category ID */
  categoryId: string;
  /** What happened */
  outcome: "confirmed" | "unconfirmed" | "ai_verified" | "ai_dismissed" | "matched";
}

/** Confidence thresholds */
export const CONFIDENCE_THRESHOLDS = {
  /** Precision >= 0.7 → high confidence */
  high: 0.7,
  /** Precision >= 0.4 → medium confidence */
  medium: 0.4,
  /** Precision < 0.4 → low confidence */
  low: 0.0,
} as const;

/**
 * Calculate suggested confidence from precision
 */
export function suggestConfidence(precision: number): "high" | "medium" | "low" {
  if (precision >= CONFIDENCE_THRESHOLDS.high) return "high";
  if (precision >= CONFIDENCE_THRESHOLDS.medium) return "medium";
  return "low";
}
