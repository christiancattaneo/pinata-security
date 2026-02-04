/**
 * Feedback Store Tests
 */

import { describe, it, expect } from "vitest";
import {
  applyUpdates,
  getConfidenceAdjustment,
  getLowPrecisionPatterns,
  getHighPrecisionPatterns,
  generateReport,
  EMPTY_FEEDBACK_STATE,
  suggestConfidence,
} from "@/feedback/index.js";
import type { FeedbackState, FeedbackUpdate } from "@/feedback/index.js";

describe("Feedback Store", () => {
  describe("suggestConfidence", () => {
    it("returns high for precision >= 0.7", () => {
      expect(suggestConfidence(0.7)).toBe("high");
      expect(suggestConfidence(0.85)).toBe("high");
      expect(suggestConfidence(1.0)).toBe("high");
    });

    it("returns medium for precision >= 0.4 and < 0.7", () => {
      expect(suggestConfidence(0.4)).toBe("medium");
      expect(suggestConfidence(0.5)).toBe("medium");
      expect(suggestConfidence(0.69)).toBe("medium");
    });

    it("returns low for precision < 0.4", () => {
      expect(suggestConfidence(0.39)).toBe("low");
      expect(suggestConfidence(0.1)).toBe("low");
      expect(suggestConfidence(0)).toBe("low");
    });
  });

  describe("applyUpdates", () => {
    it("creates new pattern on first match", () => {
      const updates: FeedbackUpdate[] = [
        { patternId: "sql-injection-1", categoryId: "sql-injection", outcome: "matched" },
      ];

      const result = applyUpdates(EMPTY_FEEDBACK_STATE, updates);

      expect(result.patterns["sql-injection-1"]).toBeDefined();
      expect(result.patterns["sql-injection-1"]?.totalMatches).toBe(1);
    });

    it("increments confirmed count", () => {
      const state: FeedbackState = {
        ...EMPTY_FEEDBACK_STATE,
        patterns: {
          "sql-injection-1": {
            patternId: "sql-injection-1",
            categoryId: "sql-injection",
            totalMatches: 5,
            confirmedCount: 2,
            unconfirmedCount: 1,
            aiDismissedCount: 0,
            aiVerifiedCount: 0,
            precision: 0.67,
            suggestedConfidence: "medium",
            updatedAt: new Date().toISOString(),
          },
        },
      };

      const updates: FeedbackUpdate[] = [
        { patternId: "sql-injection-1", categoryId: "sql-injection", outcome: "confirmed" },
      ];

      const result = applyUpdates(state, updates);

      expect(result.patterns["sql-injection-1"]?.confirmedCount).toBe(3);
      // Precision should update: 3/(3+1) = 0.75
      expect(result.patterns["sql-injection-1"]?.precision).toBe(0.75);
      expect(result.patterns["sql-injection-1"]?.suggestedConfidence).toBe("high");
    });

    it("increments unconfirmed count and lowers confidence", () => {
      const state: FeedbackState = {
        ...EMPTY_FEEDBACK_STATE,
        patterns: {
          "xss-1": {
            patternId: "xss-1",
            categoryId: "xss",
            totalMatches: 10,
            confirmedCount: 2,
            unconfirmedCount: 2,
            aiDismissedCount: 0,
            aiVerifiedCount: 0,
            precision: 0.5,
            suggestedConfidence: "medium",
            updatedAt: new Date().toISOString(),
          },
        },
      };

      const updates: FeedbackUpdate[] = [
        { patternId: "xss-1", categoryId: "xss", outcome: "unconfirmed" },
        { patternId: "xss-1", categoryId: "xss", outcome: "unconfirmed" },
        { patternId: "xss-1", categoryId: "xss", outcome: "unconfirmed" },
      ];

      const result = applyUpdates(state, updates);

      expect(result.patterns["xss-1"]?.unconfirmedCount).toBe(5);
      // Precision: 2/(2+5) = 0.286
      expect(result.patterns["xss-1"]?.precision).toBeCloseTo(0.286, 2);
      expect(result.patterns["xss-1"]?.suggestedConfidence).toBe("low");
    });

    it("tracks AI verification outcomes", () => {
      const updates: FeedbackUpdate[] = [
        { patternId: "cmd-1", categoryId: "command-injection", outcome: "ai_verified" },
        { patternId: "cmd-1", categoryId: "command-injection", outcome: "ai_dismissed" },
        { patternId: "cmd-1", categoryId: "command-injection", outcome: "ai_dismissed" },
      ];

      const result = applyUpdates(EMPTY_FEEDBACK_STATE, updates);

      expect(result.patterns["cmd-1"]?.aiVerifiedCount).toBe(1);
      expect(result.patterns["cmd-1"]?.aiDismissedCount).toBe(2);
    });

    it("increments total scans", () => {
      const result = applyUpdates(EMPTY_FEEDBACK_STATE, []);
      expect(result.totalScans).toBe(1);
    });
  });

  describe("getConfidenceAdjustment", () => {
    it("returns null for unknown pattern", () => {
      const result = getConfidenceAdjustment(EMPTY_FEEDBACK_STATE, "unknown");
      expect(result).toBeNull();
    });

    it("returns null for pattern with insufficient data", () => {
      const state: FeedbackState = {
        ...EMPTY_FEEDBACK_STATE,
        patterns: {
          "sql-1": {
            patternId: "sql-1",
            categoryId: "sql-injection",
            totalMatches: 10,
            confirmedCount: 2,
            unconfirmedCount: 1, // Only 3 executions, need 5
            aiDismissedCount: 0,
            aiVerifiedCount: 0,
            precision: 0.67,
            suggestedConfidence: "medium",
            updatedAt: new Date().toISOString(),
          },
        },
      };

      const result = getConfidenceAdjustment(state, "sql-1");
      expect(result).toBeNull();
    });

    it("returns confidence for pattern with sufficient data", () => {
      const state: FeedbackState = {
        ...EMPTY_FEEDBACK_STATE,
        patterns: {
          "sql-1": {
            patternId: "sql-1",
            categoryId: "sql-injection",
            totalMatches: 20,
            confirmedCount: 4,
            unconfirmedCount: 1, // 5 total executions
            aiDismissedCount: 0,
            aiVerifiedCount: 0,
            precision: 0.8,
            suggestedConfidence: "high",
            updatedAt: new Date().toISOString(),
          },
        },
      };

      const result = getConfidenceAdjustment(state, "sql-1");
      expect(result).toBe("high");
    });
  });

  describe("getLowPrecisionPatterns", () => {
    it("returns patterns with precision below threshold", () => {
      const state: FeedbackState = {
        ...EMPTY_FEEDBACK_STATE,
        patterns: {
          "good": {
            patternId: "good",
            categoryId: "sql",
            totalMatches: 20,
            confirmedCount: 8,
            unconfirmedCount: 2,
            aiDismissedCount: 0,
            aiVerifiedCount: 0,
            precision: 0.8,
            suggestedConfidence: "high",
            updatedAt: new Date().toISOString(),
          },
          "bad": {
            patternId: "bad",
            categoryId: "xss",
            totalMatches: 20,
            confirmedCount: 1,
            unconfirmedCount: 9,
            aiDismissedCount: 0,
            aiVerifiedCount: 0,
            precision: 0.1,
            suggestedConfidence: "low",
            updatedAt: new Date().toISOString(),
          },
        },
      };

      const result = getLowPrecisionPatterns(state, 0.3);
      
      expect(result.length).toBe(1);
      expect(result[0]?.patternId).toBe("bad");
    });
  });

  describe("getHighPrecisionPatterns", () => {
    it("returns patterns with precision above threshold", () => {
      const state: FeedbackState = {
        ...EMPTY_FEEDBACK_STATE,
        patterns: {
          "great": {
            patternId: "great",
            categoryId: "sql",
            totalMatches: 20,
            confirmedCount: 9,
            unconfirmedCount: 1,
            aiDismissedCount: 0,
            aiVerifiedCount: 0,
            precision: 0.9,
            suggestedConfidence: "high",
            updatedAt: new Date().toISOString(),
          },
          "ok": {
            patternId: "ok",
            categoryId: "xss",
            totalMatches: 20,
            confirmedCount: 3,
            unconfirmedCount: 2,
            aiDismissedCount: 0,
            aiVerifiedCount: 0,
            precision: 0.6,
            suggestedConfidence: "medium",
            updatedAt: new Date().toISOString(),
          },
        },
      };

      const result = getHighPrecisionPatterns(state, 0.8);
      
      expect(result.length).toBe(1);
      expect(result[0]?.patternId).toBe("great");
    });
  });

  describe("generateReport", () => {
    it("generates markdown report", () => {
      const state: FeedbackState = {
        ...EMPTY_FEEDBACK_STATE,
        totalScans: 10,
        patterns: {
          "sql-1": {
            patternId: "sql-1",
            categoryId: "sql-injection",
            totalMatches: 50,
            confirmedCount: 8,
            unconfirmedCount: 2,
            aiDismissedCount: 5,
            aiVerifiedCount: 35,
            precision: 0.8,
            suggestedConfidence: "high",
            updatedAt: new Date().toISOString(),
          },
        },
      };

      const report = generateReport(state);
      
      expect(report).toContain("# Pinata Feedback Report");
      expect(report).toContain("Total scans: 10");
      expect(report).toContain("Patterns tracked: 1");
      expect(report).toContain("sql-1");
      expect(report).toContain("80.0%");
    });
  });
});
