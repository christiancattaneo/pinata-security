import { describe, it, expect } from "vitest";
import {
  ok,
  err,
  unwrap,
  unwrapOr,
  map,
  mapErr,
  andThen,
  all,
  tryCatch,
  tryCatchAsync,
} from "@/lib/result.js";
import type { Result } from "@/lib/result.js";

describe("Result", () => {
  describe("ok", () => {
    it("creates successful result", () => {
      const result = ok(42);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(42);
      }
    });
  });

  describe("err", () => {
    it("creates failed result", () => {
      const error = new Error("test error");
      const result = err(error);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(error);
      }
    });
  });

  describe("unwrap", () => {
    it("returns data for successful result", () => {
      const result = ok(42);
      expect(unwrap(result)).toBe(42);
    });

    it("throws for failed result", () => {
      const result = err(new Error("test"));
      expect(() => unwrap(result)).toThrow("test");
    });
  });

  describe("unwrapOr", () => {
    it("returns data for successful result", () => {
      const result = ok(42);
      expect(unwrapOr(result, 0)).toBe(42);
    });

    it("returns default for failed result", () => {
      const result: Result<number, Error> = err(new Error("test"));
      expect(unwrapOr(result, 0)).toBe(0);
    });
  });

  describe("map", () => {
    it("transforms successful result", () => {
      const result = ok(21);
      const mapped = map(result, (x) => x * 2);
      expect(unwrap(mapped)).toBe(42);
    });

    it("passes through failed result", () => {
      const error = new Error("test");
      const result: Result<number, Error> = err(error);
      const mapped = map(result, (x) => x * 2);
      expect(mapped.success).toBe(false);
    });
  });

  describe("mapErr", () => {
    it("transforms failed result error", () => {
      const result: Result<number, string> = err("error");
      const mapped = mapErr(result, (e) => new Error(e));
      if (!mapped.success) {
        expect(mapped.error.message).toBe("error");
      }
    });

    it("passes through successful result", () => {
      const result = ok(42);
      const mapped = mapErr(result, (e) => new Error(String(e)));
      expect(unwrap(mapped)).toBe(42);
    });
  });

  describe("andThen", () => {
    it("chains successful results", () => {
      const result = ok(21);
      const chained = andThen(result, (x) => ok(x * 2));
      expect(unwrap(chained)).toBe(42);
    });

    it("short-circuits on error", () => {
      const result: Result<number, Error> = err(new Error("first"));
      const chained = andThen(result, (x) => ok(x * 2));
      expect(chained.success).toBe(false);
    });

    it("propagates error from chain", () => {
      const result = ok(21);
      const chained = andThen(result, () => err(new Error("chain error")));
      expect(chained.success).toBe(false);
    });
  });

  describe("all", () => {
    it("combines successful results", () => {
      const results = [ok(1), ok(2), ok(3)];
      const combined = all(results);
      expect(unwrap(combined)).toEqual([1, 2, 3]);
    });

    it("returns first error", () => {
      const results: Result<number, Error>[] = [
        ok(1),
        err(new Error("error")),
        ok(3),
      ];
      const combined = all(results);
      expect(combined.success).toBe(false);
    });
  });

  describe("tryCatch", () => {
    it("wraps successful function", () => {
      const result = tryCatch(() => 42);
      expect(unwrap(result)).toBe(42);
    });

    it("catches thrown error", () => {
      const result = tryCatch(() => {
        throw new Error("thrown");
      });
      expect(result.success).toBe(false);
    });

    it("wraps non-Error throws", () => {
      const result = tryCatch(() => {
        throw "string error";
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe("string error");
      }
    });
  });

  describe("tryCatchAsync", () => {
    it("wraps successful async function", async () => {
      const result = await tryCatchAsync(async () => 42);
      expect(unwrap(result)).toBe(42);
    });

    it("catches rejected promise", async () => {
      const result = await tryCatchAsync(async () => {
        throw new Error("async error");
      });
      expect(result.success).toBe(false);
    });
  });
});
