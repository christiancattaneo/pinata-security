import { describe, it, expect, vi } from "vitest";

describe("analyze command", () => {
  it("should export registerAnalyzeCommand function", async () => {
    const { registerAnalyzeCommand } = await import("../../../src/cli/commands/analyze.js");
    expect(registerAnalyzeCommand).toBeDefined();
    expect(typeof registerAnalyzeCommand).toBe("function");
  });

  it("should register command with proper structure", async () => {
    const { registerAnalyzeCommand } = await import("../../../src/cli/commands/analyze.js");
    
    // Mock commander program
    const mockCommand = {
      description: vi.fn().mockReturnThis(),
      option: vi.fn().mockReturnThis(),
      action: vi.fn().mockReturnThis(),
    };
    
    const mockProgram = {
      command: vi.fn().mockReturnValue(mockCommand),
    };

    registerAnalyzeCommand(mockProgram as any);

    // Verify command was registered
    expect(mockProgram.command).toHaveBeenCalledWith("analyze [path]");
    expect(mockCommand.description).toHaveBeenCalledWith("Scan codebase for security vulnerabilities");
    
    // Verify key options were added
    expect(mockCommand.option).toHaveBeenCalledWith(
      "-o, --output <format>", 
      "Output format: terminal, json, markdown, sarif, html, junit-xml", 
      "terminal"
    );
    expect(mockCommand.option).toHaveBeenCalledWith(
      "--exclude <dirs>", 
      "Directories to exclude (comma-separated)"
    );
    expect(mockCommand.option).toHaveBeenCalledWith(
      "--verify", 
      "Use AI to verify each match (reduces false positives)"
    );
    
    // Verify action was set
    expect(mockCommand.action).toHaveBeenCalled();
  });
});