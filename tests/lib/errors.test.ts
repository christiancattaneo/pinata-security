import { describe, it, expect } from "vitest";
import { 
  PinataError,
  ValidationError,
  ParseError,
  ConfigError
} from "../../src/lib/errors.js";

describe("Error Classes", () => {
  describe("PinataError", () => {
    it("should create a basic error", () => {
      const error = new PinataError("Test message", "TEST_CODE");
      expect(error.message).toBe("Test message");
      expect(error.name).toBe("PinataError");
      expect(error.code).toBe("TEST_CODE");
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(PinataError);
    });

    it("should include context when provided", () => {
      const context = { key: "value" };
      const error = new PinataError("Test message", "TEST_CODE", context);
      expect(error.message).toBe("Test message");
      expect(error.context).toBe(context);
    });

    it("should have proper stack trace", () => {
      const error = new PinataError("Test message", "TEST_CODE");
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain("PinataError");
      expect(error.stack).toContain("Test message");
    });

    it("should serialize to JSON", () => {
      const error = new PinataError("Test message", "TEST_CODE", { key: "value" });
      const json = error.toJSON();
      expect(json).toEqual({
        name: "PinataError",
        code: "TEST_CODE", 
        message: "Test message",
        context: { key: "value" }
      });
    });
  });

  describe("ValidationError", () => {
    it("should create a validation error", () => {
      const error = new ValidationError("Invalid input");
      expect(error.message).toBe("Invalid input");
      expect(error.name).toBe("ValidationError");
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error).toBeInstanceOf(PinataError);
      expect(error).toBeInstanceOf(ValidationError);
    });

    it("should include context when provided", () => {
      const context = { field: "username" };
      const error = new ValidationError("Field is required", context);
      expect(error.context).toEqual(context);
    });
  });

  describe("ParseError", () => {
    it("should create a parse error", () => {
      const error = new ParseError("Parse failed", "/path/to/file.ts");
      expect(error.message).toBe("Parse failed");
      expect(error.name).toBe("ParseError");
      expect(error.code).toBe("PARSE_ERROR");
      expect(error.filePath).toBe("/path/to/file.ts");
      expect(error).toBeInstanceOf(PinataError);
      expect(error).toBeInstanceOf(ParseError);
    });

    it("should include line number when provided", () => {
      const error = new ParseError("Parse failed", "/path/to/file.ts", 42);
      expect(error.line).toBe(42);
      expect(error.context).toEqual({
        filePath: "/path/to/file.ts",
        line: 42
      });
    });
  });

  describe("ConfigError", () => {
    it("should create a config error", () => {
      const error = new ConfigError("Invalid config");
      expect(error.message).toBe("Invalid config");
      expect(error.name).toBe("ConfigError");
      expect(error.code).toBe("CONFIG_ERROR");
      expect(error).toBeInstanceOf(PinataError);
      expect(error).toBeInstanceOf(ConfigError);
    });

    it("should include context when provided", () => {
      const context = { configKey: "apiKey" };
      const error = new ConfigError("Missing config", context);
      expect(error.context).toEqual(context);
    });
  });
});